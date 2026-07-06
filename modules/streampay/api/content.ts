/**
 * /api/store-content  POST - creator uploads content/URL before sharing gate link
 * /api/get-content    GET  - viewer fetches after USDC approval is verified on Arc
 *
 * Storage: in-memory Map. For production replace with Redis or Postgres.
 */

import type { Request, Response } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  createPublicClient, http, defineChain,
  parseAbi, parseAbiItem, isAddress, keccak256, toBytes, verifyMessage, verifyTypedData, hashTypedData,
  type Address, type Hex,
} from 'viem'
import type { NextFunction } from 'express'
import { getAgentWalletRecord, payAgentX402Service } from '../../../api/agent-wallet.js'
import { listAgentActivity } from '../../../api/agent-activity.js'
import { getPolyWorldcupNewsFeed, polyWorldcupArticleId } from '../../../api/poly-worldcup-news.js'
import { getPolyStreamFeed } from '../../../api/poly-stream.js'

const arcChain = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const arcClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network'),
})

const ARC_USDC = '0x3600000000000000000000000000000000000000' as const
const ALLOW_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
])
const STREAM_VAULT_ABI = parseAbi([
  'function streamInfo() view returns (address _sender, address _recipient, uint256 _totalAmount, uint64 _startTime, uint64 _endTime, uint256 _alreadyWithdrawn, bool _cancelled, uint256 _unlocked, uint256 _claimable)',
  'function isFunded() view returns (bool)',
])
const CHECKPOINT_VAULT_ABI = parseAbi([
  'function vaultInfo() view returns (address _sender,address _recipient,address _token,address _relayer,bytes32 _contentId,uint256 _totalAmount,uint256 _releasedAmount,uint256 _refundableAmount,bool _refunded,bool _funded)',
])
const CHECKPOINT_VAULT_CREATED_EVENT = parseAbiItem(
  'event CheckpointVaultCreated(address indexed vault,address indexed sender,address indexed recipient,bytes32 contentId,uint256 totalAmount,bytes32 salt)',
)
const ERC1271_ABI = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])
const ERC1271_MAGIC_VALUE = '0x1626ba7e'

type ContentEntry = {
  type: 'text' | 'url' | 'scores' | 'book' | 'video'
  content: string
  durationSeconds?: number
  creator: string
  capRaw: number
  rateRaw: number
  mode: 'unlock' | 'stream'
  title: string
  description: string
  authorName: string
  xHandle: string
  coverImage: string
  category: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedAt: number | null
  reviewNote: string
  ts: number
}

type CreatorUnlockEntry = {
  contentId: string
  agentSlug: string
  walletAddress: string
  paymentTransaction: string
  receiptActivityId: string
  ogRootHash?: string
  ogTxHash?: string
  ogExplorer?: string
  ogArchivedAt?: number
  unlockedAt: number
}

type CheckpointUnlockEntry = {
  contentId: string
  walletAddress: string
  vaultAddress: string
  createdAt: number
}

const store = new Map<string, ContentEntry>()
const unlockStore = new Map<string, CreatorUnlockEntry>()
const checkpointUnlockStore = new Map<string, CheckpointUnlockEntry>()
const reactionStore = new Map<string, { contentId: string; walletAddress: string; reaction: 'up' | 'down'; updatedAt: number }>()
const commentStore = new Map<string, { id: string; contentId: string; walletAddress: string; body: string; createdAt: number; updatedAt: number }>()
const commentReactionStore = new Map<string, { commentId: string; walletAddress: string; reaction: 'up' | 'down'; updatedAt: number }>()
const contentViewStore = new Map<string, { contentId: string; viewerKey: string; count: number; updatedAt: number }>()
const MAX_CONTENT_ID_LENGTH = 128
const MAX_CONTENT_LENGTH = 100_000
const MAX_META_TEXT_LENGTH = 2_000
const MAX_COMMENT_LENGTH = 800
const MAX_CREATOR_PROOF_AGE_MS = 10 * 60 * 1000
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const CREATOR_X402_NETWORKS = (process.env.X402_CREATOR_ACCEPT_NETWORKS ?? 'eip155:5042002')
  .split(',')
  .map(network => network.trim())
  .filter(Boolean)
const CREATOR_X402_FACILITATOR_URL = process.env.X402_CREATOR_FACILITATOR_URL?.trim()
  || process.env.X402_FACILITATOR_URL?.trim()
  || 'https://gateway-api-testnet.circle.com'
const CREATOR_AGENT_X402_PAY_CHAIN = process.env.CREATOR_AGENT_X402_PAY_CHAIN?.trim() || 'ARC-TESTNET'
const CREATOR_ADMIN_KEY = (process.env.CREATOR_ADMIN_KEY ?? '').trim()
const CHECKPOINT_FACTORY_ADDRESS = (process.env.CHECKPOINT_FACTORY_ADDRESS ?? process.env.VITE_CHECKPOINT_FACTORY_ADDRESS ?? '').trim()

type PaidRequest = Request & {
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

type CreatorUnlockResponse = {
  ok?: boolean
  type?: 'text' | 'url' | 'scores' | 'book' | 'video'
  content?: string
  payment?: PaidRequest['payment'] | null
  error?: string
}

const gatewayCache = new Map<string, (req: Request, res: Response, next: NextFunction) => void | Promise<void>>()
const CREATOR_PROOF_TYPES = {
  CreatorContent: [
    { name: 'contentId', type: 'string' },
    { name: 'creator', type: 'address' },
    { name: 'contentHash', type: 'bytes32' },
    { name: 'capRaw', type: 'uint256' },
    { name: 'issuedAt', type: 'uint256' },
  ],
} as const

const OFFICIAL_CREATOR_ADDRESS = (
  process.env.CREATOR_OFFICIAL_WALLET
  ?? process.env.DEFAULT_AGENT_WALLET_ADDRESS
  ?? process.env.TREASURY_ADDRESS
  ?? '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'
).trim()
const OFFICIAL_WORLD_CUP_NEWS_URL = (
  process.env.CREATOR_WORLD_CUP_NEWS_URL
  ?? 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026'
).trim()
const SAFE_OFFICIAL_CREATOR = isAddress(OFFICIAL_CREATOR_ADDRESS)
  ? OFFICIAL_CREATOR_ADDRESS
  : '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'

const OFFICIAL_EBOOKS: Array<{
  id: string
  title: string
  description: string
  tag: string
  identifier?: string
  gutenbergId?: string
  coverUrl?: string
  source: string
  previewText: string
}> = [
  {
    id: 'ebook-dracula',
    title: 'Dracula',
    description: 'A gothic horror classic with journals, letters, pursuit, and dread.',
    tag: 'Horror',
    identifier: 'ISBN:9780141439846',
    coverUrl: 'https://covers.openlibrary.org/b/id/13182210-L.jpg',
    source: 'Full reader',
    gutenbergId: '345',
    previewText: '',
  },
  {
    id: 'ebook-pride-and-prejudice',
    title: 'Pride and Prejudice',
    description: 'A sharp romance about love, class, first impressions, and second chances.',
    tag: 'Romance',
    identifier: 'ISBN:9780141439518',
    coverUrl: 'https://covers.openlibrary.org/b/id/14357252-L.jpg',
    source: 'Full reader',
    gutenbergId: '1342',
    previewText: '',
  },
  {
    id: 'ebook-jane-eyre',
    title: 'Jane Eyre',
    description: 'A passionate coming-of-age romance with secrets, independence, and moral tension.',
    tag: 'Love',
    identifier: 'ISBN:9780141441146',
    coverUrl: 'https://covers.openlibrary.org/b/id/12818862-L.jpg',
    source: 'Full reader',
    gutenbergId: '1260',
    previewText: '',
  },
  {
    id: 'ebook-wuthering-heights',
    title: 'Wuthering Heights',
    description: 'A stormy tale of obsession, revenge, and destructive love.',
    tag: 'Drama',
    identifier: 'ISBN:9780141439556',
    coverUrl: 'https://covers.openlibrary.org/b/id/12645111-L.jpg',
    source: 'Full reader',
    gutenbergId: '768',
    previewText: '',
  },
  {
    id: 'ebook-frankenstein',
    title: 'Frankenstein',
    description: 'A tragic science-fiction classic about ambition, creation, and responsibility.',
    tag: 'Sci-Fi',
    identifier: 'ISBN:9780486282114',
    coverUrl: 'https://covers.openlibrary.org/b/id/11238547-L.jpg',
    source: 'Full reader',
    gutenbergId: '84',
    previewText: '',
  },
  {
    id: 'ebook-sherlock-holmes',
    title: 'The Adventures of Sherlock Holmes',
    description: 'Detective stories built for clues, deduction, and chapter-by-chapter reading.',
    tag: 'Mystery',
    identifier: 'ISBN:9780140439076',
    coverUrl: 'https://covers.openlibrary.org/b/id/12767901-L.jpg',
    source: 'Full reader',
    gutenbergId: '1661',
    previewText: '',
  },
  {
    id: 'ebook-dorian-gray',
    title: 'The Picture of Dorian Gray',
    description: 'A dark literary classic about beauty, corruption, and a hidden moral cost.',
    tag: 'Literary',
    identifier: 'ISBN:9780141439570',
    coverUrl: 'https://covers.openlibrary.org/b/id/12614796-L.jpg',
    source: 'Full reader',
    gutenbergId: '174',
    previewText: '',
  },
  {
    id: 'ebook-alice-wonderland',
    title: "Alice's Adventures in Wonderland",
    description: 'A playful fantasy classic with strange scenes, sharp dialogue, and fast movement.',
    tag: 'Fantasy',
    identifier: 'ISBN:9780141439761',
    coverUrl: 'https://covers.openlibrary.org/b/id/10527843-L.jpg',
    source: 'Full reader',
    gutenbergId: '11',
    previewText: '',
  },
  {
    id: 'ebook-time-machine',
    title: 'The Time Machine',
    description: 'A compact science-fiction classic about invention, time, and future worlds.',
    tag: 'Sci-Fi',
    identifier: 'ISBN:9780141439976',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231856-L.jpg',
    source: 'Full reader',
    gutenbergId: '35',
    previewText: '',
  },
  {
    id: 'ebook-frederick-douglass',
    title: 'Narrative of the Life of Frederick Douglass',
    description: 'A true-life public-domain classic about memory, freedom, and human dignity.',
    tag: 'True Life',
    identifier: 'ISBN:9780486284996',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231995-L.jpg',
    source: 'Full reader',
    gutenbergId: '23',
    previewText: '',
  },
]

function titleCover(title: string, tag = 'Trending') {
  const words = title.split(/\s+/).filter(Boolean)
  const lineOne = words.slice(0, 2).join(' ')
  const lineTwo = words.slice(2, 5).join(' ')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="480" viewBox="0 0 320 480">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.55" stop-color="#1d4ed8"/>
          <stop offset="1" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <rect width="320" height="480" rx="18" fill="url(#g)"/>
      <rect x="22" y="22" width="276" height="436" rx="14" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <text x="36" y="74" fill="#bfdbfe" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800" letter-spacing="2">${tag.toUpperCase()}</text>
      <text x="36" y="214" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="900">${lineOne}</text>
      <text x="36" y="260" fill="#ffffff" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="800">${lineTwo}</text>
      <text x="36" y="402" fill="#dbeafe" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="800">HashpayStream</text>
      <text x="36" y="428" fill="#93c5fd" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700" letter-spacing="1.5">CREATOR PREVIEW</text>
    </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function openLibraryCover(identifier?: string, title = 'Book', tag = 'Trending') {
  if (!identifier) return titleCover(title, tag)
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(identifier.replace(/^ISBN:/i, ''))}-L.jpg`
}

const OFFICIAL_EBOOK_BY_ID = new Map(OFFICIAL_EBOOKS.map(book => [book.id, book]))
const bookCache = new Map<string, { ts: number; text: string }>()
const BOOK_CACHE_MS = 12 * 60 * 60 * 1000
const MAX_BOOK_TEXT_LENGTH = 180_000

function cleanGutenbergText(text: string) {
  let output = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const startPatterns = [
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
    /\*\*\*\s*START OF THE PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i,
  ]
  for (const pattern of startPatterns) {
    const match = output.match(pattern)
    if (match?.index !== undefined) {
      output = output.slice(match.index + match[0].length)
      break
    }
  }
  const endPatterns = [
    /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[\s\S]*$/i,
    /\*\*\*\s*END OF THE PROJECT GUTENBERG EBOOK[\s\S]*$/i,
  ]
  for (const pattern of endPatterns) output = output.replace(pattern, '')
  return output
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, MAX_BOOK_TEXT_LENGTH)
}

const FALLBACK_BOOK_TEXT_BY_GUTENBERG_ID: Record<string, string> = {
  '345': `
DRACULA

Reader edition excerpt

Jonathan Harker's Journal

3 May. Bistritz. Left Munich at 8:35 P.M., on 1st May, arriving at Vienna early next morning. I should have arrived at 6:46, but the train was an hour late. Buda-Pesth seems a wonderful place, from the glimpse which I got of it from the train and the little I could walk through the streets.

I feared to go very far from the station, as we had arrived late and would start as near the correct time as possible. The impression I had was that we were leaving the West and entering the East; the most western of splendid bridges over the Danube took us among the traditions of Turkish rule.

The district I was to pass through was full of strange customs and old stories. I had been told that every known superstition in the world gathered into the horseshoe of the Carpathians, as if it were the centre of some imaginative whirlpool.

At the hotel I found that my landlord had received a letter from Count Dracula. He and his wife looked frightened when they heard where I was going. They crossed themselves and made signs that I did not understand.

Before I left, the old woman came to my room and begged me not to go. When I told her that business called me, she asked whether I knew what day it was. It was the eve of St. George's Day, when, as she said, all evil things in the world would have full sway.

She placed a crucifix around my neck. I did not know what to do, for as an English Churchman I had been taught to regard such things as idolatrous. Yet it seemed so kindly meant, and was given in such fear, that I accepted it.

The road climbed into a wild and beautiful country. There were dark forests, green slopes, and great masses of grey rock. Sometimes the road was cut through pine woods that seemed in the falling evening to close behind us like a door.

As we drove on, the other passengers grew silent. They pointed to the setting sun, made the sign of the cross, and whispered to one another. When the driver stopped, I saw a tall man waiting beside a black carriage.

His face was strong, aquiline, with a high bridge of the thin nose and peculiarly arched nostrils. His eyebrows were massive, almost meeting over the nose, and with bushy hair that seemed to curl in its own profusion.

He greeted me in excellent English, though with a strange intonation. "Welcome to my house. Enter freely and of your own will." The words were courteous, but the castle behind him stood black against the sky, and the door closed with a sound that seemed to shut out the world.
`,
  '1342': `
PRIDE AND PREJUDICE

Reader edition excerpt

It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.

However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so fixed in the minds of the surrounding families that he is considered the rightful property of one or other of their daughters.

Mrs. Bennet was among the earliest to hear that Netherfield Park had been let at last. A young man of large fortune from the north of England had taken it, and the whole neighbourhood was in motion.

Mr. Bennet listened with dry amusement while his wife urged him to visit the newcomer. Elizabeth, Jane, and their sisters were drawn into the expectation, each in her own manner.

At the assembly, Mr. Bingley proved agreeable and handsome. His friend Mr. Darcy was admired at first for his figure and fortune, then disliked for his pride.

Elizabeth Bennet, lively in mind and quick in judgment, found herself slighted by Darcy and resolved not to be pleased with him. Yet first impressions, however sharp, are not always final.
`,
  '84': `
FRANKENSTEIN

Reader edition excerpt

You will rejoice to hear that no disaster has accompanied the commencement of an enterprise which you have regarded with such evil forebodings.

The sea stretched before us like a field of broken light. I had long desired to reach those regions of frost and silence where few men had ventured, and my heart burned with the hope of discovery.

Yet ambition is a dangerous guest. It enters as a noble companion, speaking of knowledge and glory, then grows into a master that demands every comfort and every human tie.

Victor Frankenstein learned this too late. In youth he loved the secrets of nature and pursued them with a passion that consumed sleep, friendship, and peace.

When at last his work stirred and opened its eyes, triumph became terror. The form he had made stood before him, not as a child of science, but as a mirror of his own unchecked desire.
`,
  '1661': `
THE ADVENTURES OF SHERLOCK HOLMES

Reader edition excerpt

To Sherlock Holmes she is always the woman. I have seldom heard him mention her under any other name.

In his eyes she eclipses and predominates the whole of her sex. It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise, but admirably balanced mind.

He was, I take it, the most perfect reasoning machine that the world has seen. Yet as a lover he would have placed himself in a false position.

For Holmes, facts were clay. From a smear of mud, a bent cigar ash, or the pressure of a boot heel, he built histories that astonished those who had seen only trifles.

I had seen him solve many cases, but the affair of the King of Bohemia showed me that even Holmes could meet an intelligence quick enough to surprise him.
`,
  '1260': `
JANE EYRE

Reader edition excerpt

There was no possibility of taking a walk that day. The cold winter wind had brought with it clouds so sombre, and rain so penetrating, that further outdoor exercise was out of the question.

I was glad of it. I never liked long walks, especially on chilly afternoons. Dreadful to me was the coming home in the raw twilight, with nipped fingers and toes, and a heart saddened by the consciousness of my physical inferiority.

At Gateshead Hall I was a dependent child, tolerated rather than loved. Books became my refuge, and in their pages I found countries wider than the rooms in which I was confined.

But even a quiet child has a spirit. Mine was small, wounded, and watchful; yet it would not consent forever to be treated as less than human.
`,
  '768': `
WUTHERING HEIGHTS

Reader edition excerpt

1801. I have just returned from a visit to my landlord, the solitary neighbour that I shall be troubled with.

This is certainly a beautiful country. In all England, I do not believe that I could have fixed on a situation so completely removed from the stir of society.

Wuthering Heights is the name of Mr. Heathcliff's dwelling. Wuthering being a significant provincial adjective, descriptive of the atmospheric tumult to which its station is exposed in stormy weather.

The house, the moors, and the people seemed all made of the same rough weather. Passion there did not soften into politeness; it hardened, endured, and returned with interest.
`,
  '174': `
THE PICTURE OF DORIAN GRAY

Reader edition excerpt

The studio was filled with the rich odour of roses, and when the light summer wind stirred among the trees of the garden there came through the open door the heavy scent of the lilac.

From the corner of the divan Lord Henry Wotton could just catch the gleam of the honey-sweet blossoms of a laburnum, whose tremulous branches seemed hardly able to bear the burden of a beauty so flame-like as theirs.

Basil Hallward stood before the portrait, troubled by the perfection he had captured. Beauty can be a blessing, but in Dorian Gray it became a temptation.

When youth is made into an idol, conscience becomes easy to hide. Yet what is hidden does not disappear; it waits for a room, a locked door, and a face that changes in secret.
`,
  '11': `
ALICE'S ADVENTURES IN WONDERLAND

Reader edition excerpt

Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.

Once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it. "And what is the use of a book," thought Alice, "without pictures or conversations?"

So she was considering, in her own mind, whether the pleasure of making a daisy-chain would be worth the trouble of getting up, when suddenly a White Rabbit with pink eyes ran close by her.

There was nothing so very remarkable in that, nor did Alice think it so very much out of the way to hear the Rabbit say to itself, "Oh dear! Oh dear! I shall be too late!"
`,
  '23': `
NARRATIVE OF THE LIFE OF FREDERICK DOUGLASS

Reader edition excerpt

I was born in Tuckahoe, near Hillsborough, and about twelve miles from Easton, in Talbot county, Maryland.

I have no accurate knowledge of my age, never having seen any authentic record containing it. By far the larger part of the slaves know as little of their ages as horses know of theirs.

The want of information concerning my own was a source of unhappiness to me even during childhood. The white children could tell their ages. I could not tell why I ought to be deprived of the same privilege.

To know oneself is not a luxury. It is part of freedom. The story that follows is therefore not only a memory of suffering, but a record of a mind insisting on its own humanity.
`,
  '35': `
THE TIME MACHINE

Reader edition excerpt

The Time Traveller was expounding a recondite matter to us. His grey eyes shone and twinkled, and his usually pale face was flushed and animated.

The fire burned brightly, and the soft radiance of the incandescent lights caught the bubbles that flashed and passed in our glasses.

"You must follow me carefully," he said. "I shall have to controvert one or two ideas that are almost universally accepted."

He spoke of length, breadth, thickness, and then of duration. If a cube may exist in three dimensions, why should not a man move in the fourth?

The machine he showed us was small enough to sit upon a table, yet in its polished bars and ivory controls lay the promise of centuries.
`,
}

async function fetchOfficialBookText(gutenbergId: string) {
  const cached = bookCache.get(gutenbergId)
  if (cached && Date.now() - cached.ts < BOOK_CACHE_MS) return cached.text
  const urls = [
    `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`,
    `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}.txt`,
    `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`,
  ]
  let lastError = ''
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'HashpayStream reader (public-domain book rendering)',
          Accept: 'text/plain,*/*;q=0.8',
        },
      })
      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}`.trim()
        continue
      }
      const text = cleanGutenbergText(await response.text())
      if (text.length > 500) {
        bookCache.set(gutenbergId, { ts: Date.now(), text })
        return text
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }
  throw new Error(lastError || 'Book text unavailable.')
}

const DEVELOPER_TERMINAL_SETUP_ARTICLE = `
<p><em>If you are new to coding, start here.</em> This guide helps you turn one Mac or Windows laptop into a simple building station. You will set up a terminal, GitHub, Claude Code, Codex, and the main hosting tools without needing to understand everything first.</p>
<p>Think of it like setting up a gaming console before playing. You do the boring setup once. After that, every new project becomes much easier.</p>
<h2>The tools in plain English</h2>
<ul>
  <li><strong>Terminal</strong> - the app where you type commands.</li>
  <li><strong>Claude Code</strong> - an AI coding helper that works inside your terminal.</li>
  <li><strong>OpenAI Codex</strong> - a second AI reviewer you can use to check your code.</li>
  <li><strong>GitHub</strong> - the online home where your code is saved.</li>
  <li><strong>Vercel</strong> - a fast place to publish websites and frontends.</li>
  <li><strong>Railway</strong> - useful for APIs, bots, workers, and databases.</li>
  <li><strong>Render</strong> - useful when one app has both frontend and backend.</li>
</ul>
<p>The goal is simple: build, review, save to GitHub, and deploy from one terminal.</p>
<h2>Step 1: Create accounts</h2>
<p>Create these first. Use the same email if you can, because it makes login easier.</p>
<ul>
  <li><a href="https://claude.ai">Claude</a> - use Pro or Max if you want Claude Code through your subscription.</li>
  <li><a href="https://github.com/signup">GitHub</a> - your public builder profile and code storage.</li>
  <li><a href="https://vercel.com/signup">Vercel</a> - sign up with GitHub.</li>
  <li><a href="https://railway.app">Railway</a> - sign up with GitHub.</li>
  <li><a href="https://render.com">Render</a> - sign up with GitHub.</li>
  <li><a href="https://developers.openai.com/codex">OpenAI Codex</a> - add this when you want a second code audit.</li>
</ul>
<h2>Step 2: Install a code editor</h2>
<p>Install <a href="https://code.visualstudio.com">VS Code</a>. It is free and works everywhere. You can try <a href="https://cursor.com">Cursor</a> later, but VS Code is enough to start.</p>
<h2>Step 3: Open your terminal</h2>
<p>On Mac, press Cmd + Space, type Terminal, and press Enter.</p>
<p>On Windows, install Windows Terminal from the Microsoft Store. Open it and use PowerShell first. After you install Git, you will also see Git Bash.</p>
<h2>Step 4: Install Node.js</h2>
<p>Node.js gives you <code>npm</code>. Many developer tools are installed with npm.</p>
<p>On Mac, install Homebrew from <a href="https://brew.sh">brew.sh</a>, then run:</p>
<pre><code>brew install node</code></pre>
<p>On Windows, install the LTS version from <a href="https://nodejs.org">nodejs.org</a>. Use the default installer settings, then close and reopen your terminal.</p>
<p>Check that it worked:</p>
<pre><code>node --version</code></pre>
<pre><code>npm --version</code></pre>
<p>If Node is version 18 or higher, you are good.</p>
<h2>Step 5: Install Git</h2>
<p>Git saves your code history. GitHub uses Git.</p>
<p>Check if you already have it:</p>
<pre><code>git --version</code></pre>
<p>On Mac, install it with Homebrew if it is missing:</p>
<pre><code>brew install git</code></pre>
<p>On Windows, install it from <a href="https://git-scm.com/download/win">git-scm.com/download/win</a> and keep the default settings.</p>
<h2>Step 6: Install Claude Code</h2>
<p>Use the official <a href="https://docs.anthropic.com/en/docs/claude-code/setup">Claude Code setup guide</a>. Install it, then check:</p>
<pre><code>claude --version</code></pre>
<p>Start it:</p>
<pre><code>claude</code></pre>
<p>Log in with Claude Pro or Max in the browser. When you are done, type:</p>
<pre><code>/exit</code></pre>
<p>Later, open any project folder and run <code>claude</code>. That puts your AI engineer inside that project.</p>
<h2>Step 7: Connect GitHub</h2>
<p>Install the GitHub CLI from <a href="https://cli.github.com">cli.github.com</a>.</p>
<p>On Mac:</p>
<pre><code>brew install gh</code></pre>
<p>On Windows:</p>
<pre><code>winget install --id GitHub.cli</code></pre>
<p>Log in:</p>
<pre><code>gh auth login</code></pre>
<p>Choose GitHub.com, HTTPS, and browser login. Verify it:</p>
<pre><code>gh auth status</code></pre>
<p>This lets your AI helper create repos, commit work, and push code safely through your GitHub account.</p>
<h2>Step 8: Add Codex for audits</h2>
<p><em>You can skip this on day one.</em> When your first project works, install Codex from the official <a href="https://developers.openai.com/codex">OpenAI Codex docs</a>.</p>
<p>A simple workflow is: Claude Code builds. Codex audits. Claude Code fixes. Ask Codex: <em>audit this repo for bugs, broken flows, mobile issues, and security risks.</em></p>
<h2>Step 9: Connect hosting</h2>
<p>Use Vercel for simple websites and frontends:</p>
<pre><code>npm install -g vercel</code></pre>
<pre><code>vercel login</code></pre>
<p>Use Railway for APIs, bots, workers, and databases:</p>
<pre><code>npm install -g @railway/cli</code></pre>
<pre><code>railway login</code></pre>
<p>Use Render when you want frontend and backend in one hosted service. Render is mostly set up from the dashboard after connecting GitHub.</p>
<h2>Your first real workflow</h2>
<p>Every new project can start like this:</p>
<pre><code>mkdir -p ~/projects/my-new-build</code></pre>
<pre><code>cd ~/projects/my-new-build</code></pre>
<pre><code>claude</code></pre>
<p>Then say what you want in normal English: <em>Build the first version, initialize git, create a private GitHub repo with gh, push it, and tell me the repo URL.</em></p>
<h2>Safety rules</h2>
<ul>
  <li>Never paste private keys, seed phrases, API keys, or bearer tokens into AI chat.</li>
  <li>Put secrets in Vercel, Railway, or Render environment variables.</li>
  <li>Make sure <code>.env</code> is in <code>.gitignore</code>.</li>
  <li>Use GitHub login in your real browser.</li>
  <li>Save important local secrets in a password manager.</li>
</ul>
<h2>You are ready when</h2>
<p>These commands all work in one terminal:</p>
<pre><code>node --version</code></pre>
<pre><code>npm --version</code></pre>
<pre><code>git --version</code></pre>
<pre><code>claude --version</code></pre>
<pre><code>gh auth status</code></pre>
<p>That is the beginner unlock: one laptop, one terminal, AI help, GitHub, and deployment ready to go.</p>
<p><em>By SHY.</em></p>
`.trim()
const DEVELOPER_TERMINAL_SETUP_IMAGE = '/brand/developer-terminal-setup.jpg'

const OFFICIAL_CONTENT: Record<string, ContentEntry> = {
  'developer-terminal-setup': {
    type: 'text',
    content: DEVELOPER_TERMINAL_SETUP_ARTICLE,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_DEVELOPER_GUIDE_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'Before You Build: AI Terminal Setup',
    description: 'A simple beginner guide to setting up one terminal for AI coding, GitHub, and deployment.',
    authorName: 'SHY',
    xHandle: 'Hash_PayLink',
    coverImage: DEVELOPER_TERMINAL_SETUP_IMAGE,
    category: 'developers',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: 'Developer setup',
    ts: Date.now(),
  },
  'worldcup-news': {
    type: 'url',
    content: OFFICIAL_WORLD_CUP_NEWS_URL,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_NEWS_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'World Cup News Pulse',
    description: 'Paid tournament context and market-moving headlines for readers who want the full source.',
    authorName: 'HashpayStream Pulse',
    xHandle: 'Hash_PayLink',
    coverImage: '/brand/world-globe.png',
    category: 'worldcup-news',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  },
  'worldcup-scores': {
    type: 'scores',
    content: 'worldcup-scores',
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_SCORES_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'World Cup Scores',
    description: 'Live World Cup scores with exact Polymarket market routes when a fixture is confidently matched.',
    authorName: 'HashpayStream desk',
    xHandle: 'Hash_PayLink',
    coverImage: '/brand/world-globe.png',
    category: 'live-scores',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  },
  'hashwatch-video-demo': {
    type: 'video',
    content: '/hashwatch-pay-as-you-watch-demo.mp4',
    durationSeconds: 30,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: 0,
    rateRaw: 1000,
    mode: 'unlock',
    title: 'HashWatch: Pay-As-You-Watch Demo',
    description: 'A 30 second in-platform walkthrough for testing HashWatch checkpoints, receipts, and refundable unwatched balance.',
    authorName: 'HashpayStream Studio',
    xHandle: 'Hash_PayLink',
    coverImage: 'https://images.unsplash.com/photo-1492724441997-5dc865305da7?auto=format&fit=crop&w=1200&q=80',
    category: 'hashwatch',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: 'HashWatch',
    ts: Date.now(),
  },
  ...Object.fromEntries(OFFICIAL_EBOOKS.map((book, index) => [book.id, {
    type: 'book' as const,
    content: book.gutenbergId ? `gutenberg:${book.gutenbergId}` : `preview:${book.id}`,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_EBOOK_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock' as const,
    title: book.title,
    description: book.description,
    authorName: book.source,
    xHandle: 'Hash_PayLink',
    coverImage: book.coverUrl || openLibraryCover(book.identifier, book.title, book.tag),
    category: 'ebooks',
    reviewStatus: 'approved' as const,
    reviewedAt: Date.now(),
    reviewNote: book.tag,
    ts: Date.now(),
  }])),
}

async function readOfficialWorldCupNewsEntry(contentId: string): Promise<ContentEntry | null> {
  if (!contentId.startsWith('worldcup-news-')) return null
  const feed = await getPolyWorldcupNewsFeed().catch(() => null)
  const articles = feed?.articles ?? []
  const match = articles.find((article, index) => polyWorldcupArticleId(article, index) === contentId)
  if (!match?.url) return null
  return {
    type: 'url',
    content: match.url,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_WORLD_CUP_NEWS_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: match.title,
    description: match.description,
    authorName: match.source || 'HashpayStream Pulse',
    xHandle: 'Hash_PayLink',
    coverImage: match.image || '/brand/world-globe.png',
    category: 'worldcup-news',
    reviewStatus: 'approved',
    reviewedAt: Date.now(),
    reviewNote: '',
    ts: Date.now(),
  }
}
const { Pool } = pg
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function ensureSchema() {
  if (!pool) return Promise.resolve()
  if (!schemaReady) {
    schemaReady = pool.query(`
      create table if not exists streampay_creator_content (
        content_id text primary key,
        creator text not null,
        type text not null,
        content text not null,
        cap_raw integer not null default 0,
        rate_raw integer not null default 0,
        mode text not null default 'unlock',
        title text not null default '',
        description text not null default '',
        author_name text not null default '',
        x_handle text not null default '',
        cover_image text not null default '',
        category text not null default 'crypto',
        review_status text not null default 'pending',
        reviewed_at timestamptz,
        review_note text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_content_creator_idx on streampay_creator_content (creator);
      alter table streampay_creator_content add column if not exists rate_raw integer not null default 0;
      alter table streampay_creator_content add column if not exists mode text not null default 'unlock';
      alter table streampay_creator_content add column if not exists title text not null default '';
      alter table streampay_creator_content add column if not exists description text not null default '';
      alter table streampay_creator_content add column if not exists author_name text not null default '';
      alter table streampay_creator_content add column if not exists x_handle text not null default '';
      alter table streampay_creator_content add column if not exists cover_image text not null default '';
      alter table streampay_creator_content add column if not exists category text not null default 'crypto';
      alter table streampay_creator_content add column if not exists review_status text not null default 'pending';
      alter table streampay_creator_content add column if not exists reviewed_at timestamptz;
      alter table streampay_creator_content add column if not exists review_note text not null default '';
      create index if not exists streampay_creator_content_review_idx on streampay_creator_content (review_status, updated_at desc);
      create table if not exists streampay_creator_unlocks (
        unlock_key text primary key,
        content_id text not null,
        agent_slug text not null,
        wallet_address text not null default '',
        payment_transaction text not null default '',
        receipt_activity_id text not null default '',
        og_root_hash text not null default '',
        og_tx_hash text not null default '',
        og_explorer text not null default '',
        og_archived_at timestamptz,
        unlocked_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table streampay_creator_unlocks add column if not exists og_root_hash text not null default '';
      alter table streampay_creator_unlocks add column if not exists og_tx_hash text not null default '';
      alter table streampay_creator_unlocks add column if not exists og_explorer text not null default '';
      alter table streampay_creator_unlocks add column if not exists og_archived_at timestamptz;
      create index if not exists streampay_creator_unlocks_content_idx on streampay_creator_unlocks (content_id, updated_at desc);
      create index if not exists streampay_creator_unlocks_agent_idx on streampay_creator_unlocks (agent_slug, updated_at desc);
      create index if not exists streampay_creator_unlocks_wallet_idx on streampay_creator_unlocks (wallet_address, updated_at desc);
      create index if not exists streampay_creator_unlocks_receipt_idx on streampay_creator_unlocks (receipt_activity_id);
      create table if not exists streampay_creator_reactions (
        content_id text not null,
        wallet_address text not null,
        reaction text not null check (reaction in ('up', 'down')),
        updated_at timestamptz not null default now(),
        primary key (content_id, wallet_address)
      );
      create index if not exists streampay_creator_reactions_content_idx on streampay_creator_reactions (content_id, updated_at desc);
      create table if not exists streampay_creator_comments (
        comment_id text primary key,
        content_id text not null,
        wallet_address text not null,
        body text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_comments_content_idx on streampay_creator_comments (content_id, created_at desc);
      create table if not exists streampay_creator_comment_reactions (
        comment_id text not null,
        wallet_address text not null,
        reaction text not null check (reaction in ('up', 'down')),
        updated_at timestamptz not null default now(),
        primary key (comment_id, wallet_address)
      );
      create index if not exists streampay_creator_comment_reactions_comment_idx on streampay_creator_comment_reactions (comment_id);
      create table if not exists streampay_creator_content_views (
        content_id text not null,
        viewer_key text not null,
        view_count integer not null default 1,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (content_id, viewer_key)
      );
      create index if not exists streampay_creator_content_views_content_idx on streampay_creator_content_views (content_id, updated_at desc);
      create table if not exists streampay_checkpoint_unlocks (
        checkpoint_key text primary key,
        content_id text not null,
        wallet_address text not null,
        vault_address text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_checkpoint_unlocks_wallet_idx on streampay_checkpoint_unlocks (wallet_address, updated_at desc);
    `).then(() => undefined)
  }
  return schemaReady
}

function cleanReviewStatus(value: unknown): ContentEntry['reviewStatus'] {
  const status = String(value ?? 'pending').trim().toLowerCase()
  return status === 'approved' || status === 'rejected' ? status : 'pending'
}

function rowToContentEntry(row: Record<string, unknown>): ContentEntry {
  const type = String(row.type ?? '')
  return {
    type: type === 'url' ? 'url' : type === 'scores' ? 'scores' : type === 'book' ? 'book' : type === 'video' ? 'video' : 'text',
    content: String(row.content ?? ''),
    creator: String(row.creator ?? ''),
    capRaw: Number(row.cap_raw ?? 0),
    rateRaw: Number(row.rate_raw ?? 0),
    mode: String(row.mode) === 'stream' ? 'stream' : 'unlock',
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    authorName: String(row.author_name ?? ''),
    xHandle: String(row.x_handle ?? ''),
    coverImage: String(row.cover_image ?? ''),
    category: String(row.category ?? 'crypto'),
    reviewStatus: cleanReviewStatus(row.review_status),
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.getTime() : null,
    reviewNote: String(row.review_note ?? ''),
    ts: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.now(),
  }
}

async function readContentEntry(contentId: string): Promise<ContentEntry | null> {
  if (OFFICIAL_CONTENT[contentId]) return OFFICIAL_CONTENT[contentId]
  if (contentId.startsWith('worldcup-score-')) {
    return {
      ...OFFICIAL_CONTENT['worldcup-scores'],
      title: 'World Cup Scores',
      content: contentId,
      ts: Date.now(),
    }
  }
  const officialNews = await readOfficialWorldCupNewsEntry(contentId)
  if (officialNews) return officialNews
  if (pool) {
    await ensureSchema()
    const result = await pool.query('select * from streampay_creator_content where content_id = $1 limit 1', [contentId])
    if (!result.rowCount) return null
    return rowToContentEntry(result.rows[0])
  }
  return store.get(contentId) ?? null
}

async function writeContentEntry(contentId: string, entry: ContentEntry) {
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_creator_content (
         content_id, creator, type, content, cap_raw, rate_raw, mode,
         title, description, author_name, x_handle, cover_image, category,
         review_status, reviewed_at, review_note,
         created_at, updated_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, to_timestamp($17 / 1000.0), now())
       on conflict (content_id) do update set
         creator = excluded.creator,
         type = excluded.type,
         content = excluded.content,
         cap_raw = excluded.cap_raw,
         rate_raw = excluded.rate_raw,
         mode = excluded.mode,
         title = excluded.title,
         description = excluded.description,
         author_name = excluded.author_name,
         x_handle = excluded.x_handle,
         cover_image = excluded.cover_image,
         category = excluded.category,
         review_status = excluded.review_status,
         reviewed_at = excluded.reviewed_at,
         review_note = excluded.review_note,
         updated_at = now()`,
      [
        contentId,
        entry.creator,
        entry.type,
        entry.content,
        entry.capRaw,
        entry.rateRaw,
        entry.mode,
        entry.title,
        entry.description,
        entry.authorName,
        entry.xHandle,
        entry.coverImage,
        entry.category,
        entry.reviewStatus,
        entry.reviewedAt ? new Date(entry.reviewedAt) : null,
        entry.reviewNote,
        entry.ts,
      ],
    )
    return
  }
  store.set(contentId, entry)
}

function unlockKey(contentId: string, agentSlug: string, walletAddress = '') {
  const wallet = String(walletAddress || '').trim().toLowerCase()
  return `${contentId}:${wallet || agentSlug}`
}

function checkpointKey(contentId: string, walletAddress: string) {
  return `${contentId}:${String(walletAddress || '').trim().toLowerCase()}`
}

function checkpointReceiptId(vaultAddress: string) {
  return `hps-checkpoint-${String(vaultAddress || '').trim().toLowerCase()}`
}

function parseCheckpointReceiptId(receiptId: string) {
  const value = String(receiptId || '').trim().toLowerCase()
  if (!value.startsWith('hps-checkpoint-')) return ''
  const vault = value.slice('hps-checkpoint-'.length)
  return isAddress(vault) ? vault : ''
}

function rowToUnlockEntry(row: Record<string, unknown>): CreatorUnlockEntry {
  return {
    contentId: String(row.content_id ?? ''),
    agentSlug: String(row.agent_slug ?? ''),
    walletAddress: String(row.wallet_address ?? ''),
    paymentTransaction: String(row.payment_transaction ?? ''),
    receiptActivityId: String(row.receipt_activity_id ?? ''),
    ogRootHash: String(row.og_root_hash ?? ''),
    ogTxHash: String(row.og_tx_hash ?? ''),
    ogExplorer: String(row.og_explorer ?? ''),
    ogArchivedAt: row.og_archived_at instanceof Date ? row.og_archived_at.getTime() : undefined,
    unlockedAt: row.unlocked_at instanceof Date ? row.unlocked_at.getTime() : Date.now(),
  }
}

function rowToCheckpointUnlockEntry(row: Record<string, unknown>): CheckpointUnlockEntry {
  return {
    contentId: String(row.content_id ?? ''),
    walletAddress: String(row.wallet_address ?? ''),
    vaultAddress: String(row.vault_address ?? ''),
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
  }
}

function unlockRowToEarning(row: Record<string, unknown>) {
  const capRaw = Number(row.cap_raw ?? 0)
  return {
    kind: 'fixed' as const,
    contentId: String(row.content_id ?? ''),
    title: String(row.title ?? 'Creator content'),
    amount: Math.max(0.000001, Math.ceil(Math.max(1, capRaw || 0)) / 1_000_000),
    asset: 'USDC',
    payer: String(row.wallet_address ?? ''),
    receiptActivityId: String(row.receipt_activity_id ?? ''),
    transaction: String(row.payment_transaction ?? ''),
    unlockedAt: row.unlocked_at instanceof Date ? row.unlocked_at.getTime() : Date.now(),
  }
}

export async function findCreatorUnlockReceipt(activityId: string) {
  const id = String(activityId ?? '').trim()
  if (!id) return null
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select
         u.content_id,
         u.agent_slug,
         u.wallet_address,
         u.payment_transaction,
         u.receipt_activity_id,
         u.og_root_hash,
         u.og_tx_hash,
         u.og_explorer,
         u.og_archived_at,
         u.unlocked_at,
         c.creator,
         c.type,
         c.cap_raw,
         c.mode,
         c.title,
         c.description,
         c.category
       from streampay_creator_unlocks u
       left join streampay_creator_content c on c.content_id = u.content_id
       where u.receipt_activity_id = $1
       order by u.updated_at desc
       limit 1`,
      [id],
    )
    if ((result.rowCount ?? 0) > 0) return creatorUnlockReceiptFromRow(result.rows[0], id)
    return null
  }
  const found = Array.from(unlockStore.values()).find(item => item.receiptActivityId === id)
  if (!found) return null
  const entry = await readContentEntry(found.contentId)
  return creatorUnlockReceiptFromRow({
    content_id: found.contentId,
    agent_slug: found.agentSlug,
    wallet_address: found.walletAddress,
    payment_transaction: found.paymentTransaction,
    receipt_activity_id: found.receiptActivityId,
    og_root_hash: found.ogRootHash ?? '',
    og_tx_hash: found.ogTxHash ?? '',
    og_explorer: found.ogExplorer ?? '',
    og_archived_at: found.ogArchivedAt ? new Date(found.ogArchivedAt) : null,
    unlocked_at: new Date(found.unlockedAt),
    creator: entry?.creator ?? '',
    type: entry?.type ?? 'text',
    cap_raw: entry?.capRaw ?? 0,
    mode: entry?.mode ?? 'unlock',
    title: entry?.title ?? 'Creator content',
    description: entry?.description ?? '',
    category: entry?.category ?? 'crypto',
  }, id)
}

function creatorUnlockReceiptFromRow(row: Record<string, unknown>, activityId: string) {
  const capRaw = Math.max(1, Number(row.cap_raw ?? 0) || 0)
  const amount = Math.ceil(capRaw) / 1_000_000
  const txRef = String(row.payment_transaction ?? '')
  const payer = String(row.wallet_address ?? '')
  const creator = String(row.creator ?? '')
  const contentId = String(row.content_id ?? '')
  const category = String(row.category ?? 'creator')
  const contentType = String(row.type ?? 'text')
  const title = String(row.title ?? '').trim() || (
    contentType === 'video' || category === 'hashwatch'
      ? 'HashWatch video unlocked'
      : contentType === 'book' || category === 'ebooks'
      ? 'Book unlocked'
      : 'Creator content unlocked'
  )
  const proofHash = createHash('sha256').update([
    'hashpaystream-x402-receipt',
    activityId,
    contentId,
    payer,
    creator,
    txRef,
    String(amount),
  ].join(':')).digest('hex')
  return {
    type: 'circle_gateway_x402_receipt',
    activityId,
    agentSlug: String(row.agent_slug ?? ''),
    title,
    amount: `${amount.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })} USDC`,
    asset: 'USDC',
    chain: 'arc',
    txHash: txRef || proofHash,
    payer,
    merchantId: creator,
    source: 'x402',
    detail: `${category === 'hashwatch' || contentType === 'video' ? 'HashWatch pay-as-you-watch access' : category === 'developers' ? 'Developer guide access' : category === 'ebooks' || contentType === 'book' ? 'Ebook reader access' : 'Creator content access'} on HashpayStream`,
    createdAt: row.unlocked_at instanceof Date ? row.unlocked_at.getTime() : Date.now(),
    proof: {
      kind: 'circle_gateway_x402',
      provider: 'Circle Gateway',
      service: 'HashpayStream Creator Checkout',
      payer,
      seller: creator,
      amount: `${amount.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })} USDC`,
      network: 'Arc',
      transaction: txRef,
      serviceUrl: `${baseUrl()}/api/get-content-x402?id=${encodeURIComponent(contentId)}`,
      generatedAt: new Date().toISOString(),
      receiptHash: proofHash,
      proofHash,
      contentId,
      contentType,
      category,
    },
    og: String(row.og_tx_hash ?? '') || String(row.og_root_hash ?? '') || String(row.og_explorer ?? '')
      ? {
          rootHash: String(row.og_root_hash ?? ''),
          ogTxHash: String(row.og_tx_hash ?? ''),
          ogExplorer: String(row.og_explorer ?? ''),
          archivedAt: row.og_archived_at instanceof Date ? row.og_archived_at.getTime() : Date.now(),
        }
      : undefined,
  }
}

export async function updateCreatorUnlockOgProof(activityId: string, og?: {
  rootHash?: string
  ogTxHash?: string
  ogExplorer?: string
  archivedAt?: number
}) {
  const id = String(activityId ?? '').trim()
  if (!id || !og || (!og.rootHash && !og.ogTxHash && !og.ogExplorer)) return false
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `update streampay_creator_unlocks
       set og_root_hash = $2,
           og_tx_hash = $3,
           og_explorer = $4,
           og_archived_at = to_timestamp($5 / 1000.0),
           updated_at = now()
       where receipt_activity_id = $1`,
      [
        id,
        String(og.rootHash ?? ''),
        String(og.ogTxHash ?? ''),
        String(og.ogExplorer ?? ''),
        Number(og.archivedAt || Date.now()),
      ],
    )
    return (result.rowCount ?? 0) > 0
  }
  let updated = false
  for (const [key, item] of unlockStore.entries()) {
    if (item.receiptActivityId !== id) continue
    unlockStore.set(key, {
      ...item,
      ogRootHash: String(og.rootHash ?? ''),
      ogTxHash: String(og.ogTxHash ?? ''),
      ogExplorer: String(og.ogExplorer ?? ''),
      ogArchivedAt: Number(og.archivedAt || Date.now()),
    })
    updated = true
  }
  return updated
}

async function checkpointUnlockToEarning(unlock: CheckpointUnlockEntry, creator: string) {
  const entry = await readContentEntry(unlock.contentId)
  if (!entry || entry.creator.toLowerCase() !== creator.toLowerCase()) return null
  try {
    const state = await verifyCheckpointVaultState(unlock.contentId, entry, unlock.vaultAddress, { allowRefunded: true })
    const releasedAmount = BigInt(state.releasedAmount)
    if (releasedAmount <= 0n) return null
    return {
      kind: 'checkpoint' as const,
      contentId: unlock.contentId,
      title: entry.title || 'Creator content',
      amount: Number(releasedAmount) / 1_000_000,
      asset: 'USDC',
      payer: unlock.walletAddress,
      receiptActivityId: checkpointReceiptId(unlock.vaultAddress),
      transaction: unlock.vaultAddress,
      unlockedAt: unlock.createdAt,
    }
  } catch {
    return null
  }
}

export async function findCheckpointReceipt(receiptId: string) {
  const vault = parseCheckpointReceiptId(receiptId)
  if (!vault) return null

  let unlock: CheckpointUnlockEntry | null = null
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select *
       from streampay_checkpoint_unlocks
       where lower(vault_address) = $1
       order by updated_at desc
       limit 1`,
      [vault],
    )
    unlock = (result.rowCount ?? 0) > 0 ? rowToCheckpointUnlockEntry(result.rows[0]) : null
  } else {
    unlock = Array.from(checkpointUnlockStore.values()).find(item => item.vaultAddress.toLowerCase() === vault) ?? null
  }
  if (!unlock) return null

  const entry = await readContentEntry(unlock.contentId)
  if (!entry) return null
  const state = await verifyCheckpointVaultState(unlock.contentId, entry, unlock.vaultAddress, { allowRefunded: true })
  const released = Number(BigInt(state.releasedAmount)) / 1_000_000
  const total = Number(BigInt(state.totalAmount)) / 1_000_000
  const refundable = Number(BigInt(state.refundableAmount)) / 1_000_000
  const progress = total > 0 ? Math.min(100, Math.round((released / total) * 100)) : 0
  const proofHash = createHash('sha256').update(JSON.stringify({
    type: 'hashpaystream_checkpoint_receipt',
    receiptId,
    contentId: unlock.contentId,
    vaultAddress: unlock.vaultAddress,
    reader: state.sender,
    creator: entry.creator,
    releasedAmount: state.releasedAmount,
    refundableAmount: state.refundableAmount,
    totalAmount: state.totalAmount,
  })).digest('hex')

  return {
    type: 'hashpaystream_checkpoint_receipt',
    activityId: receiptId,
    agentSlug: 'hashpaystream',
    title: entry.type === 'video' ? 'Pay-as-you-watch checkpoint receipt' : 'Pay-as-you-read checkpoint receipt',
    amount: `${released.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })} USDC`,
    asset: 'USDC',
    chain: 'arc',
    txHash: unlock.vaultAddress,
    payer: state.sender,
    merchantId: entry.creator,
    source: 'streampay',
    settlementType: 'checkpoint-escrow',
    detail: `${entry.title || 'Creator content'} - ${progress}% released, ${refundable.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })} USDC refundable`,
    createdAt: unlock.createdAt,
    proof: {
      service: 'HashpayStream checkpoint escrow',
      network: 'Arc Testnet',
      transaction: unlock.vaultAddress,
      payer: state.sender,
      seller: entry.creator,
      amount: state.releasedAmount,
      totalAmount: state.totalAmount,
      refundableAmount: state.refundableAmount,
      releasedAmount: state.releasedAmount,
      contentId: unlock.contentId,
      checkpointProgress: progress,
      receiptHash: proofHash,
      proofHash,
    },
  }
}

function cleanWalletAddress(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function cleanReaction(value: unknown): 'up' | 'down' | null {
  const reaction = String(value ?? '').trim().toLowerCase()
  return reaction === 'up' || reaction === 'down' ? reaction : null
}

function cleanCommentBody(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT_LENGTH)
}

function cleanViewerKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:._-]/g, '')
    .slice(0, 160)
}

async function readCreatorUnlock(contentId: string, agentSlug: string, walletAddress = '') {
  const wallet = String(walletAddress || '').trim().toLowerCase()
  if (pool) {
    await ensureSchema()
    const result = wallet
      ? await pool.query(
          `select * from streampay_creator_unlocks
           where content_id = $1 and (lower(wallet_address) = lower($2) or agent_slug = $3)
           order by updated_at desc limit 1`,
          [contentId, wallet, agentSlug],
        )
      : await pool.query(
          `select * from streampay_creator_unlocks
           where content_id = $1 and agent_slug = $2
           order by updated_at desc limit 1`,
          [contentId, agentSlug],
        )
    return result.rowCount ? rowToUnlockEntry(result.rows[0]) : null
  }
  if (wallet) return unlockStore.get(unlockKey(contentId, agentSlug, wallet)) ?? unlockStore.get(unlockKey(contentId, agentSlug)) ?? null
  return unlockStore.get(unlockKey(contentId, agentSlug)) ?? null
}

async function hasWalletUnlockedContent(contentId: string, walletAddress: string) {
  const wallet = cleanWalletAddress(walletAddress)
  if (!wallet) return false
  await ensureSchema()
  if (pool) {
    const fixed = await pool.query(
      `select 1 from streampay_creator_unlocks where content_id = $1 and lower(wallet_address) = $2 limit 1`,
      [contentId, wallet],
    )
    if ((fixed.rowCount ?? 0) > 0) return true
    const checkpoint = await pool.query(
      `select 1 from streampay_checkpoint_unlocks where content_id = $1 and lower(wallet_address) = $2 limit 1`,
      [contentId, wallet],
    )
    return (checkpoint.rowCount ?? 0) > 0
  }
  return Array.from(unlockStore.values()).some(unlock => (
    unlock.contentId === contentId && unlock.walletAddress.toLowerCase() === wallet
  )) || Array.from(checkpointUnlockStore.values()).some(unlock => (
    unlock.contentId === contentId && unlock.walletAddress.toLowerCase() === wallet
  ))
}

async function writeCreatorUnlock(entry: CreatorUnlockEntry) {
  const key = unlockKey(entry.contentId, entry.agentSlug, entry.walletAddress)
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_creator_unlocks
        (unlock_key, content_id, agent_slug, wallet_address, payment_transaction, receipt_activity_id, og_root_hash, og_tx_hash, og_explorer, og_archived_at, unlocked_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $10 > 0 then to_timestamp($10 / 1000.0) else null end, to_timestamp($11 / 1000.0), now())
       on conflict (unlock_key) do update set
         agent_slug = excluded.agent_slug,
         wallet_address = excluded.wallet_address,
         payment_transaction = excluded.payment_transaction,
         receipt_activity_id = excluded.receipt_activity_id,
         og_root_hash = case when excluded.og_root_hash <> '' then excluded.og_root_hash else streampay_creator_unlocks.og_root_hash end,
         og_tx_hash = case when excluded.og_tx_hash <> '' then excluded.og_tx_hash else streampay_creator_unlocks.og_tx_hash end,
         og_explorer = case when excluded.og_explorer <> '' then excluded.og_explorer else streampay_creator_unlocks.og_explorer end,
         og_archived_at = coalesce(excluded.og_archived_at, streampay_creator_unlocks.og_archived_at),
         updated_at = now()`,
      [
        key,
        entry.contentId,
        entry.agentSlug,
        entry.walletAddress,
        entry.paymentTransaction,
        entry.receiptActivityId,
        entry.ogRootHash ?? '',
        entry.ogTxHash ?? '',
        entry.ogExplorer ?? '',
        entry.ogArchivedAt ?? 0,
        entry.unlockedAt,
      ],
    )
    return
  }
  unlockStore.set(key, entry)
}

async function readCheckpointUnlock(contentId: string, walletAddress: string) {
  const wallet = cleanWalletAddress(walletAddress)
  if (!wallet) return null
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_checkpoint_unlocks
       where content_id = $1 and lower(wallet_address) = $2
       order by updated_at desc limit 1`,
      [contentId, wallet],
    )
    return (result.rowCount ?? 0) > 0 ? rowToCheckpointUnlockEntry(result.rows[0]) : null
  }
  return checkpointUnlockStore.get(checkpointKey(contentId, wallet)) ?? null
}

async function writeCheckpointUnlock(entry: CheckpointUnlockEntry) {
  const wallet = cleanWalletAddress(entry.walletAddress)
  const key = checkpointKey(entry.contentId, wallet)
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_checkpoint_unlocks
        (checkpoint_key, content_id, wallet_address, vault_address, created_at, updated_at)
       values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), now())
       on conflict (checkpoint_key) do update set
         vault_address = excluded.vault_address,
         updated_at = now()`,
      [key, entry.contentId, wallet, entry.vaultAddress, entry.createdAt],
    )
    return
  }
  checkpointUnlockStore.set(key, { ...entry, walletAddress: wallet })
}

async function findLegacyCreatorUnlock(contentId: string, agentSlug: string, walletAddress = '') {
  const activity = await listAgentActivity(agentSlug, 80)
  const wallet = walletAddress.toLowerCase()
  const found = activity.find(item => {
    if (item.type !== 'scout_returned') return false
    if (item.result?.contentId !== contentId) return false
    if (wallet && item.wallet && item.wallet.toLowerCase() !== wallet) return false
    return item.title === 'Creator content unlocked'
  })
  if (!found) return null
  const paid = activity.find(item => (
    item.type === 'x402_spent' &&
    item.proof?.serviceUrl?.includes(`id=${encodeURIComponent(contentId)}`) &&
    (!wallet || !item.wallet || item.wallet.toLowerCase() === wallet)
  ))
  const restored: CreatorUnlockEntry = {
    contentId,
    agentSlug,
    walletAddress: walletAddress || found.wallet || paid?.wallet || '',
    paymentTransaction: paid?.proof?.transaction || paid?.txHash || '',
    receiptActivityId: paid?.id || '',
    unlockedAt: found.createdAt,
  }
  await writeCreatorUnlock(restored)
  return restored
}

function creatorPrice(entry: ContentEntry) {
  if (isPublicDemoContentEntry(entry)) return '$0'
  const raw = Math.max(1, Math.round(Number(entry.capRaw) || 0))
  return `$${(raw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
}

function isPublicDemoContentId(contentId: string) {
  return contentId === 'hashwatch-video-demo'
}

function isPublicDemoContentEntry(entry: Pick<ContentEntry, 'type' | 'content' | 'capRaw'>) {
  return entry.type === 'video'
    && Number(entry.capRaw) <= 0
    && String(entry.content ?? '').includes('hashwatch-pay-as-you-watch-demo.mp4')
}

function isHexSignature(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{130}$/.test(value)
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
}

function toContentBytes32(value: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return value as `0x${string}`
  const bytes = Array.from(new TextEncoder().encode(value))
  const hex = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 64).padEnd(64, '0')
  return `0x${hex}` as `0x${string}`
}

function normalizeAgentSlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function cleanMetaText(value: unknown, max = MAX_META_TEXT_LENGTH) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanCategory(value: unknown) {
  const category = String(value ?? 'crypto').trim().toLowerCase()
  if (category === 'news') return 'worldcup-news'
  if (category === 'sports') return 'live-scores'
  if (category === 'video' || category === 'videos' || category === 'watch') return 'hashwatch'
  if (category === 'general') return 'crypto'
  return ['worldcup-news', 'live-scores', 'ebooks', 'crypto', 'developers', 'hashwatch'].includes(category) ? category : 'crypto'
}

function baseUrl() {
  return (process.env.HASH_PAYLINK_BASE_URL ?? process.env.PUBLIC_APP_URL ?? 'https://hashpaylink.com').replace(/\/+$/, '')
}

function buildGateLink(params: {
  contentId: string
  creator: string
  rateRaw: number
  capRaw: number
  title: string
  mode: 'unlock' | 'stream'
  type: ContentEntry['type']
  category: string
}) {
  const p = new URLSearchParams()
  p.set('app', 'streampay')
  p.set('id', params.contentId)
  p.set('cr', params.creator)
  p.set('r', String(params.rateRaw))
  p.set('cap', String(params.capRaw))
  p.set('mode', params.mode)
  p.set('pay', 'choice')
  p.set('ct', params.type)
  p.set('cat', params.category)
  if (params.title.trim()) p.set('t', params.title.trim())
  return `${baseUrl()}/gate?${p.toString()}`
}

function entryToPost(contentId: string, entry: ContentEntry) {
  return {
    id: contentId,
    contentId,
    creator: entry.creator,
    title: entry.title,
    description: entry.description,
    authorName: entry.authorName,
    xHandle: entry.xHandle,
    coverImage: entry.coverImage,
    category: entry.category,
    reviewStatus: entry.reviewStatus,
    reviewedAt: entry.reviewedAt,
    reviewNote: entry.reviewNote,
    type: entry.type,
    mode: entry.mode,
    durationSeconds: entry.durationSeconds,
    capRaw: entry.capRaw,
    rateRaw: entry.rateRaw,
    createdAt: entry.ts,
    gateLink: buildGateLink({
      contentId,
      creator: entry.creator,
      rateRaw: entry.rateRaw,
      capRaw: entry.capRaw,
      title: entry.title,
      mode: entry.mode,
      type: entry.type,
      category: entry.category,
    }),
  }
}

function absoluteMediaUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `${baseUrl()}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`
}

function requireCreatorAdmin(req: Request, res: Response) {
  if (!CREATOR_ADMIN_KEY) {
    res.status(503).json({ ok: false, error: 'Creator admin approval is not configured.' })
    return false
  }
  const headerKey = String(req.headers['x-creator-admin-key'] ?? '').trim()
  const bodyKey = String((req.body as { adminKey?: unknown } | undefined)?.adminKey ?? '').trim()
  const queryKey = String((req.query as { adminKey?: string }).adminKey ?? '').trim()
  if (headerKey !== CREATOR_ADMIN_KEY && bodyKey !== CREATOR_ADMIN_KEY && queryKey !== CREATOR_ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Admin approval key is invalid.' })
    return false
  }
  return true
}

function creatorProofMessage(params: {
  contentId: string
  creator: string
  contentHash: string
  capRaw: number
  issuedAt: number
}) {
  return [
    'Publish HashpayStream Creator Studio content',
    '',
    `Content ID: ${shortId(params.contentId)}`,
    `Creator wallet: ${params.creator}`,
    `Price: ${(params.capRaw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} USDC`,
    'Network: Arc Testnet',
    '',
    'This signature proves you control the creator wallet.',
    'It does not move funds or approve spending.',
    '',
    `Content hash: ${params.contentHash}`,
    `Issued at: ${params.issuedAt}`,
  ].join('\n')
}

async function verifyCreatorProof(params: {
  contentId: string
  creator: Address
  content: string
  capRaw: number
  issuedAt: number
  signature: Hex
  proofType: 'message' | 'typedData'
}) {
  const age = Math.abs(Date.now() - params.issuedAt)
  if (!Number.isFinite(params.issuedAt) || age > MAX_CREATOR_PROOF_AGE_MS) return false
  const contentHash = keccak256(toBytes(params.content))

  if (params.proofType === 'message') {
    return verifyMessage({
      address: params.creator,
      message: creatorProofMessage({
        contentId: params.contentId,
        creator: params.creator,
        contentHash,
        capRaw: params.capRaw,
        issuedAt: params.issuedAt,
      }),
      signature: params.signature,
    })
  }

  const typedData = {
    address: params.creator,
    domain: {
      name: 'HashpayStream Creator Studio',
      version: '1',
      chainId: 5042002,
      verifyingContract: params.creator,
    },
    types: CREATOR_PROOF_TYPES,
    primaryType: 'CreatorContent',
    message: {
      contentId: params.contentId,
      creator: params.creator,
      contentHash,
      capRaw: BigInt(params.capRaw),
      issuedAt: BigInt(params.issuedAt),
    },
    signature: params.signature,
  } as const
  const eoaValid = await verifyTypedData(typedData)
  if (eoaValid) return true

  const bytecode = await arcClient.getBytecode({ address: params.creator }).catch(() => undefined)
  if (!bytecode || bytecode === '0x') return false

  const digest = hashTypedData({
    domain: typedData.domain,
    types: typedData.types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  })
  const magic = await arcClient.readContract({
    address: params.creator,
    abi: ERC1271_ABI,
    functionName: 'isValidSignature',
    args: [digest, params.signature],
  }).catch(() => null)
  return typeof magic === 'string' && magic.toLowerCase() === ERC1271_MAGIC_VALUE
}

async function creatorGatewayMiddleware(entry: ContentEntry) {
  const price = creatorPrice(entry)
  const cacheKey = `${entry.creator.toLowerCase()}:${price}:${CREATOR_X402_NETWORKS.join(',')}:${CREATOR_X402_FACILITATOR_URL}`
  const cached = gatewayCache.get(cacheKey)
  if (cached) return cached

  const { createGatewayMiddleware } = await import('@circle-fin/x402-batching/server')
  const gateway = createGatewayMiddleware({
    sellerAddress: entry.creator,
    networks: CREATOR_X402_NETWORKS,
    facilitatorUrl: CREATOR_X402_FACILITATOR_URL,
    description: 'HashpayStream Creator Studio content access',
  })
  const middleware = gateway.require(price)
  gatewayCache.set(cacheKey, middleware)
  return middleware
}

export async function storeContent(req: Request, res: Response) {
  const {
    contentId,
    creator,
    type,
    content,
    capRaw,
    rateRaw,
    mode,
    title,
    description,
    authorName,
    xHandle,
    coverImage,
    category,
    issuedAt,
    signature,
    proofType,
  } = (req.body ?? {}) as {
    contentId?: string
    creator?: string
    type?: string
    content?: string
    capRaw?: number
    rateRaw?: number
    mode?: string
    title?: string
    description?: string
    authorName?: string
    xHandle?: string
    coverImage?: string
    category?: string
    issuedAt?: number
    signature?: string
    proofType?: string
  }

  if (!contentId || !creator || !type || !content || !issuedAt || !signature) {
    return res.status(400).json({ ok: false, error: 'contentId, creator, type, content, issuedAt, and signature are required' })
  }
  if (contentId.length > MAX_CONTENT_ID_LENGTH || content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ ok: false, error: 'contentId or content is too large' })
  }
  if (type !== 'text' && type !== 'url' && type !== 'video') {
    return res.status(400).json({ ok: false, error: 'type must be "text", "url", or "video"' })
  }
  const safeType = type as ContentEntry['type']
  if (!isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }
  const safeCapRaw = Math.max(0, Number(capRaw) || 0)
  if (!isHexSignature(signature)) {
    return res.status(400).json({ ok: false, error: 'creator signature is invalid' })
  }
  const safeRateRaw = Math.max(0, Number(rateRaw) || 0)
  const safeCategory = cleanCategory(category)
  const streamModeAllowed = safeType === 'text' || (safeType === 'video' && safeCategory === 'hashwatch') || safeCategory === 'live-scores'
  const safeMode = mode === 'stream' && safeType !== 'url' && streamModeAllowed ? 'stream' : 'unlock'
  const creatorVerified = await verifyCreatorProof({
    contentId,
    creator,
    content,
    capRaw: safeCapRaw,
    issuedAt: Number(issuedAt),
    signature,
    proofType: proofType === 'typedData' ? 'typedData' : 'message',
  }).catch(() => false)
  if (!creatorVerified) {
    return res.status(401).json({ ok: false, error: 'Creator wallet proof failed. Sign again and retry.' })
  }

  const existing = await readContentEntry(contentId)
  if (existing && existing.creator.toLowerCase() !== creator.toLowerCase()) {
    return res.status(409).json({ ok: false, error: 'contentId is already registered' })
  }

  await writeContentEntry(contentId, {
    type: safeType,
    content,
    creator,
    capRaw: safeCapRaw,
    rateRaw: safeRateRaw,
    mode: safeMode,
    title: cleanMetaText(title, 100),
    description: cleanMetaText(description, 180),
    authorName: cleanMetaText(authorName, 80),
    xHandle: cleanMetaText(xHandle, 40).replace(/^@+/, ''),
    coverImage: String(coverImage ?? '').trim().slice(0, 120_000),
    category: safeCategory,
    reviewStatus: existing?.reviewStatus ?? 'pending',
    reviewedAt: existing?.reviewedAt ?? null,
    reviewNote: existing?.reviewNote ?? '',
    ts: Date.now(),
  })

  return res.status(200).json({ ok: true, reviewStatus: existing?.reviewStatus ?? 'pending' })
}

export async function listCreatorContent(req: Request, res: Response) {
  const { creator } = req.query as { creator?: string }
  if (!creator || !isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }

  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      'select * from streampay_creator_content where lower(creator) = lower($1) order by updated_at desc limit 50',
      [creator],
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.creator.toLowerCase() === creator.toLowerCase())
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 50)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

export async function listApprovedCreatorContent(_req: Request, res: Response) {
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_creator_content
       where review_status = 'approved'
       order by coalesce(reviewed_at, updated_at) desc, updated_at desc
       limit 50`,
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.reviewStatus === 'approved')
    .sort((a, b) => (b[1].reviewedAt ?? b[1].ts) - (a[1].reviewedAt ?? a[1].ts))
    .slice(0, 50)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

type AgentContentCard = ReturnType<typeof entryToPost> & {
  priceUsdc: number
  insights: {
    summary: string
    explainPrompt: string
    suggestedQuestions: string[]
    contentInputs: string[]
  }
  social: {
    views: number
    likes: number
    dislikes: number
    comments: number
    unlocks: number
    score: number
  }
}

function safeContentPreview(entry: ContentEntry, maxLength = 900) {
  if (entry.type === 'url') return 'Private external link. Full destination is hidden unless access is verified.'
  if (entry.type === 'video') return 'Private HashWatch video media. Agent Hash can explain verified metadata unless unlocked context is supplied.'
  if (entry.type === 'book') return entry.description || 'Book text is available to verified readers in the HashpayStream reader.'
  return cleanMetaText(entry.content || entry.description || '', maxLength)
}

function unlockedContentContext(entry: ContentEntry) {
  const content = String(entry.content ?? '')
  if (entry.type === 'url') {
    return {
      kind: 'private-link',
      summary: entry.description || 'Unlocked private creator link.',
      privateUrl: content.slice(0, 1_000),
    }
  }
  if (entry.type === 'video') {
    return {
      kind: 'hashwatch-video',
      summary: entry.description || 'Unlocked HashWatch video.',
      videoUrl: absoluteMediaUrl(content).slice(0, 1_000),
      durationSeconds: entry.durationSeconds,
      note: 'Use supplied metadata and URL context. Do not claim frame-level video analysis unless ZeroScout can inspect the media URL.',
    }
  }
  if (entry.type === 'book') {
    return {
      kind: 'ebook',
      summary: entry.description || 'Unlocked ebook.',
      source: content.slice(0, 120),
      note: 'Use book metadata here. Full public-domain text can be retrieved by the reader endpoint when available.',
    }
  }
  return {
    kind: 'paid-post',
    summary: entry.description || entry.title,
    text: cleanMetaText(content, 2_400),
  }
}

async function buildAccessAwareContentContext(contentId: string, walletAddress: string) {
  const safeContentId = String(contentId ?? '').trim()
  if (!safeContentId || safeContentId.length > MAX_CONTENT_ID_LENGTH) return null
  const entry = await readContentEntry(safeContentId)
  if (!entry) return { contentId: safeContentId, status: 'not-found' as const }
  const publicDemo = isPublicDemoContentId(safeContentId) && isPublicDemoContentEntry(entry)
  const unlocked = publicDemo || await hasWalletUnlockedContent(safeContentId, walletAddress)
  return {
    status: unlocked ? 'unlocked' as const : 'locked' as const,
    contentId: safeContentId,
    metadata: entryToPost(safeContentId, entry),
    priceUsdc: priceUsdc(entry),
    preview: safeContentPreview(entry),
    unlockedContent: unlocked ? unlockedContentContext(entry) : null,
    accessRule: publicDemo
      ? 'This is a public HashWatch demo. Do not ask for payment or another unlock; answer from unlockedContent and metadata.'
      : unlocked
      ? 'This wallet has already unlocked this content. Do not ask for another unlock; answer from unlockedContent and metadata.'
      : 'This wallet is not verified as unlocked for this content. Give public metadata/preview only and say full private summary requires unlocking or reconnecting the original reader wallet.',
  }
}

function contentInsights(entry: ContentEntry) {
  const title = entry.title || (entry.type === 'video' ? 'HashWatch video' : entry.type === 'book' ? 'Ebook' : 'Creator post')
  const description = cleanMetaText(entry.description || '', 280)
  const typeLabel = entry.type === 'video'
    ? 'HashWatch video'
    : entry.type === 'book'
      ? 'ebook'
      : entry.type === 'scores'
        ? 'live-score card'
        : entry.type === 'url'
          ? 'private link'
          : 'paid post'
  const summary = description
    ? `${title}: ${description}`
    : `${title} is a ${typeLabel} on HashpayStream. Use the title, category, creator metadata, social stats, and unlock mode as verified context.`
  const suggestedQuestions = entry.type === 'video'
    ? ['What is this HashWatch video about?', 'Who should unlock this video?', 'What price fits this video?']
    : entry.type === 'book'
      ? ['Summarize this book.', 'Who would enjoy this book?', 'Why use pay-as-you-read for this book?']
      : ['Summarize this post.', 'Suggest a price.', 'How should the creator improve this post?']
  return {
    summary,
    explainPrompt: `Explain "${title}" as a ${typeLabel} using only verified HashpayStream metadata unless unlocked content text is supplied in the user chat.`,
    suggestedQuestions,
    contentInputs: [
      'title',
      'description',
      'creator',
      'category',
      'content type',
      'unlock mode',
      'price',
      'views',
      'likes',
      'comments',
      'unlocks',
      'gate link',
    ],
  }
}

function priceUsdc(entry: Pick<ContentEntry, 'capRaw'>) {
  if (Number(entry.capRaw) <= 0) return 0
  return Math.max(0.000001, Math.ceil(Math.max(1, Number(entry.capRaw) || 0)) / 1_000_000)
}

function scoreContentId(match: { fixtureId?: string; title?: string; kickoffAt?: string; time?: string }, index: number) {
  const raw = match.fixtureId || `${match.title || 'fixture'}-${match.kickoffAt || match.time || index}`
  return `worldcup-score-${String(raw).replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 64)}`
}

function scoreTitleParts(title: string) {
  const parts = title.split(/\s+(?:vs\.?|v)\s+/i).map(part => part.trim()).filter(Boolean)
  return { home: parts[0] || title, away: parts[1] || '' }
}

function scoreEntryFromMatch(match: Record<string, unknown>, index: number): [string, ContentEntry] {
  const title = String(match.title ?? 'World Cup fixture')
  const { home, away } = scoreTitleParts(title)
  const contentId = scoreContentId({
    fixtureId: String(match.fixtureId ?? ''),
    title,
    kickoffAt: String(match.kickoffAt ?? ''),
    time: String(match.time ?? ''),
  }, index)
  return [contentId, {
    ...OFFICIAL_CONTENT['worldcup-scores'],
    content: contentId,
    title: away ? `${home} vs ${away}` : title,
    description: String(match.marketStatus ?? '') === 'matched'
      ? 'Live score context with a matched route available.'
      : 'Live or upcoming World Cup fixture context.',
    reviewNote: String(match.status ?? match.tag ?? 'Fixture'),
    ts: Date.now(),
  }]
}

async function contentUnlockCount(contentId: string) {
  if (pool) {
    await ensureSchema()
    const [fixed, checkpoint] = await Promise.all([
      pool.query(`select count(*)::int as count from streampay_creator_unlocks where content_id = $1`, [contentId]),
      pool.query(`select count(*)::int as count from streampay_checkpoint_unlocks where content_id = $1`, [contentId]),
    ])
    return Number(fixed.rows[0]?.count ?? 0) + Number(checkpoint.rows[0]?.count ?? 0)
  }
  return Array.from(unlockStore.values()).filter(item => item.contentId === contentId).length
    + Array.from(checkpointUnlockStore.values()).filter(item => item.contentId === contentId).length
}

async function agentCardFromEntry(contentId: string, entry: ContentEntry): Promise<AgentContentCard> {
  const [social, views, unlocks] = await Promise.all([
    readCreatorSocial(contentId),
    readCreatorContentViews(contentId),
    contentUnlockCount(contentId),
  ])
  const comments = Array.isArray(social.comments) ? social.comments.length : 0
  const likes = Number(social.upCount ?? 0)
  const dislikes = Number(social.downCount ?? 0)
  const score = (views * 3) + (likes * 6) + (comments * 5) + (unlocks * 8) - (dislikes * 2)
  return {
    ...entryToPost(contentId, entry),
    priceUsdc: priceUsdc(entry),
    insights: contentInsights(entry),
    social: {
      views,
      likes,
      dislikes,
      comments,
      unlocks,
      score,
    },
  }
}

async function approvedContentEntries() {
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_creator_content
       where review_status = 'approved'
       order by coalesce(reviewed_at, updated_at) desc, updated_at desc
       limit 60`,
    )
    return result.rows.map(row => [String(row.content_id), rowToContentEntry(row)] as [string, ContentEntry])
  }
  return Array.from(store.entries())
    .filter(([, entry]) => entry.reviewStatus === 'approved')
    .sort((a, b) => (b[1].reviewedAt ?? b[1].ts) - (a[1].reviewedAt ?? a[1].ts))
    .slice(0, 60)
}

export async function buildHashpayStreamAgentContext(params: { creator?: unknown; wallet?: unknown; date?: unknown; contentId?: unknown; contentTitle?: unknown } = {}) {
  const creator = String(params.creator ?? '').trim()
  const wallet = cleanWalletAddress(params.wallet)
  let activeContentId = String(params.contentId ?? '').trim()
  const activeContentTitle = cleanMetaText(String(params.contentTitle ?? ''), 220).toLowerCase()
  const selectedDate = String(params.date ?? new Date().toISOString().slice(0, 10)).trim().slice(0, 10)
  const [newsFeed, scoreFeed, approvedEntries] = await Promise.all([
    getPolyWorldcupNewsFeed().catch(() => null),
    getPolyStreamFeed(selectedDate).catch(() => null),
    approvedContentEntries().catch(() => [] as Array<[string, ContentEntry]>),
  ])

  const newsEntries: Array<[string, ContentEntry]> = (newsFeed?.articles ?? [])
    .filter(article => article.url)
    .slice(0, 10)
    .map((article, index) => [polyWorldcupArticleId(article, index), {
      ...OFFICIAL_CONTENT['worldcup-news'],
      content: article.url,
      title: article.title,
      description: article.description,
      authorName: article.source || 'HashpayStream Pulse',
      coverImage: article.image || '/brand/world-globe.png',
      reviewNote: article.tag,
      ts: Number.isFinite(Date.parse(article.publishedAt)) ? Date.parse(article.publishedAt) : Date.now(),
    }] as [string, ContentEntry])

  const scoreEntries: Array<[string, ContentEntry]> = (scoreFeed?.matches ?? [])
    .slice(0, 16)
    .map((match, index) => scoreEntryFromMatch(match as Record<string, unknown>, index))

  const officialEntries = Object.entries(OFFICIAL_CONTENT)
    .filter(([contentId]) => contentId !== 'worldcup-scores' && (contentId !== 'worldcup-news' || !newsEntries.length))

  const deduped = new Map<string, ContentEntry>()
  for (const [contentId, entry] of [
    ...officialEntries,
    ...newsEntries,
    ...scoreEntries,
    ...approvedEntries,
  ] as Array<[string, ContentEntry]>) {
    if (!deduped.has(contentId)) deduped.set(contentId, entry)
  }

  if (!activeContentId && activeContentTitle) {
    const normalizedNeedle = activeContentTitle.replace(/[^a-z0-9]+/g, ' ').trim()
    const match = Array.from(deduped.entries()).find(([, entry]) => {
      const normalizedTitle = cleanMetaText(entry.title || '', 220).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      return normalizedTitle
        && (normalizedTitle === normalizedNeedle || normalizedTitle.includes(normalizedNeedle) || normalizedNeedle.includes(normalizedTitle))
    })
    if (match) activeContentId = match[0]
  }

  const cards = (await Promise.all(
    Array.from(deduped.entries()).slice(0, 90).map(([contentId, entry]) => agentCardFromEntry(contentId, entry)),
  )).sort((a, b) => b.social.score - a.social.score || b.createdAt - a.createdAt)

  const categoryCounts = cards.reduce<Record<string, number>>((acc, card) => {
    acc[card.category] = (acc[card.category] ?? 0) + 1
    return acc
  }, {})
  const contentByCategory = ['developers', 'hashwatch', 'worldcup-news', 'live-scores', 'ebooks', 'crypto'].reduce<Record<string, AgentContentCard[]>>((acc, category) => {
    acc[category] = cards.filter(card => card.category === category).slice(0, 15)
    return acc
  }, {})
  const topViewed = [...cards].sort((a, b) => b.social.views - a.social.views).slice(0, 8)
  const mostLiked = [...cards].sort((a, b) => b.social.likes - a.social.likes).slice(0, 8)
  const mostDiscussed = [...cards].sort((a, b) => b.social.comments - a.social.comments).slice(0, 8)
  const mostUnlocked = [...cards].sort((a, b) => b.social.unlocks - a.social.unlocks).slice(0, 8)
  const latestPosts = [...cards].sort((a, b) => b.createdAt - a.createdAt).slice(0, 12)
  const latestHashWatch = [...cards]
    .filter(card => card.type === 'video' || card.category === 'hashwatch')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
  const latestBooks = [...cards]
    .filter(card => card.type === 'book' || card.category === 'ebooks')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)
  const worldCupNewsCards = newsEntries.length
    ? newsEntries.slice(0, 8).map(([contentId, entry]) => entryToPost(contentId, entry))
    : cards.filter(card => card.category === 'worldcup-news').slice(0, 8)

  let creatorEarnings: unknown = null
  if (creator && isAddress(creator)) {
    const fakeReq = { query: { creator } } as unknown as Request
    const json = await new Promise<unknown>(resolve => {
      const fakeRes = {
        json: (payload: unknown) => resolve(payload),
        status: () => fakeRes,
      } as unknown as Response
      void listCreatorEarnings(fakeReq, fakeRes)
    }).catch(() => null)
    creatorEarnings = json
  }

  return {
    ok: true,
    product: 'HashpayStream',
    updatedAt: new Date().toISOString(),
    selectedDate,
    wallet: wallet || undefined,
    creator: creator && isAddress(creator) ? creator : undefined,
    x402: {
      managerUrl: 'https://hashpaylink.com/agent?profile=agent&walletManager=service',
      activationCopy: 'Fund Circle wallet balance, activate x402 service balance, then use fixed unlocks and paid services.',
      supportedInCreatorCheckout: ['fixed x402 unlock'],
    },
    unlockModes: [
      { id: 'checkpoint', label: 'Pay as you read', description: 'Reader prepays once; creator earnings release at scroll checkpoints; unread USDC remains refundable.' },
      { id: 'x402', label: 'Fixed unlock', description: 'Reader pays once with Circle Gateway x402 and keeps access to the content.' },
      { id: 'watch', label: 'Pay as you watch', description: 'For HashWatch videos; reader prepays once and creator earnings release at playback checkpoints.' },
    ],
    statsCapabilities: {
      contentViews: true,
      reactions: true,
      comments: true,
      unlocks: true,
      worldCupNews: Boolean(newsFeed?.articles?.length),
      worldCupScores: Boolean(scoreFeed?.matches?.length),
      worldCupTopScorers: false,
      note: 'Top-scorer tables are not currently wired to a verified provider endpoint.',
    },
    discovery: {
      categoryCounts,
      trending: cards.slice(0, 12),
      topViewed,
      mostLiked,
      mostDiscussed,
      mostUnlocked,
      latestPosts,
      bestEbooks: contentByCategory.ebooks ?? [],
      hashWatch: contentByCategory.hashwatch ?? [],
      latestHashWatch,
      latestBooks,
      latestWorldCupNews: worldCupNewsCards,
      liveScores: scoreEntries.slice(0, 12).map(([contentId, entry]) => entryToPost(contentId, entry)),
      byCategory: contentByCategory,
    },
    latestByType: {
      video: latestHashWatch[0] ?? null,
      book: latestBooks[0] ?? null,
      post: latestPosts[0] ?? null,
    },
    assistantPlaybook: {
      answerScope: [
        'creator publishing',
        'fixed x402 unlocks',
        'pay-as-you-read checkpoints',
        'pay-as-you-watch HashWatch checkpoints',
        'HashWatch video discovery',
        'ebook discovery and summaries from verified metadata',
        'content pricing',
        'post improvement',
        'social reactions and comments',
        'creator earnings',
        'receipts and 0G archive status',
      ],
      contentRules: [
        'For latest video questions, use discovery.latestHashWatch first, then discovery.hashWatch.',
        'For latest book questions, use discovery.latestBooks first, then discovery.bestEbooks.',
        'For "what is this about" questions, use the card insights summary and description; do not pretend to have watched a private video or read locked text unless the user supplies unlocked content.',
        'If activeContent.status is unlocked, never ask the reader to unlock the same content again. Use activeContent.unlockedContent and metadata.',
        'If activeContent.status is locked, give public metadata and explain that full private analysis requires the original unlocked wallet/session.',
        'For creator earnings, use creatorEarnings only when a creator wallet is supplied; otherwise ask for the creator wallet or tell the user to open Creator Hub earnings.',
        'For price suggestions, compare content type, description depth, and current HashpayStream prices; suggest a practical USDC range.',
        'For 0G archive questions, say archived only when proof metadata exists; otherwise say archiving can continue in the background.',
      ],
    },
    activeContent: activeContentId ? await buildAccessAwareContentContext(activeContentId, wallet) : null,
    creatorEarnings,
  }
}

export async function getHashpayStreamAgentContext(req: Request, res: Response) {
  return res.json(await buildHashpayStreamAgentContext({
    creator: req.query.creator,
    wallet: req.query.wallet,
    date: req.query.date,
  }))
}

export async function listCreatorAdminContent(req: Request, res: Response) {
  if (!requireCreatorAdmin(req, res)) return
  const status = cleanReviewStatus((req.query as { status?: string }).status || 'pending')

  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select * from streampay_creator_content
       where review_status = $1
       order by updated_at desc
       limit 100`,
      [status],
    )
    return res.status(200).json({
      ok: true,
      posts: result.rows.map(row => entryToPost(String(row.content_id), rowToContentEntry(row))),
    })
  }

  const posts = Array.from(store.entries())
    .filter(([, entry]) => entry.reviewStatus === status)
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, 100)
    .map(([contentId, entry]) => entryToPost(contentId, entry))

  return res.status(200).json({ ok: true, posts })
}

export async function reviewCreatorContent(req: Request, res: Response) {
  if (!requireCreatorAdmin(req, res)) return
  const { contentId, action, note } = (req.body ?? {}) as {
    contentId?: string
    action?: string
    note?: string
  }
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH) {
    return res.status(400).json({ ok: false, error: 'contentId is required.' })
  }
  const reviewStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null
  if (!reviewStatus) {
    return res.status(400).json({ ok: false, error: 'action must be approve or reject.' })
  }

  const existing = await readContentEntry(contentId)
  if (!existing) return res.status(404).json({ ok: false, error: 'Content not found.' })
  const updated: ContentEntry = {
    ...existing,
    reviewStatus,
    reviewedAt: Date.now(),
    reviewNote: cleanMetaText(note, 240),
    ts: Date.now(),
  }
  await writeContentEntry(contentId, updated)
  return res.status(200).json({ ok: true, post: entryToPost(contentId, updated) })
}

export async function getContent(req: Request, res: Response) {
  const { id, viewer, demo } = req.query as { id?: string; viewer?: string; demo?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }
  if (demo === '1' && isPublicDemoContentId(id) && isPublicDemoContentEntry(entry)) {
    return res.status(200).json({
      ok: true,
      publicDemo: true,
      type: entry.type,
      content: entry.content,
      coverImage: entry.coverImage,
    })
  }

  if (!viewer || !isAddress(viewer)) {
    return res.status(400).json({ ok: false, error: 'viewer must be a valid EVM address' })
  }

  const poaContract = process.env.ARC_POA_CONTRACT
  if (!poaContract || !isAddress(poaContract)) {
    return res.status(503).json({ ok: false, error: 'Content gate is not configured' })
  }

  try {
    const allowance = await arcClient.readContract({
      address: ARC_USDC,
      abi: ALLOW_ABI,
      functionName: 'allowance',
      args: [viewer as `0x${string}`, poaContract as `0x${string}`],
    }) as bigint

    if (allowance < BigInt(entry.capRaw)) {
      return res.status(403).json({
        ok: false,
        error: 'USDC spending is not approved. Complete the gate first.',
      })
    }
  } catch {
    return res.status(503).json({ ok: false, error: 'Content gate verification unavailable' })
  }

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content, coverImage: entry.coverImage })
}

export async function getContentStreamEscrow(req: Request, res: Response) {
  const { id, vault } = req.query as { id?: string; vault?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
  if (!vault || !isAddress(vault)) {
    return res.status(400).json({ ok: false, error: 'A valid nano meter vault is required.' })
  }

  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }
  if (entry.type === 'url') {
    return res.status(400).json({ ok: false, error: 'External links use fixed unlock only.' })
  }
  if (entry.category !== 'live-scores') {
    return res.status(400).json({
      ok: false,
      error: 'Timed streaming is reserved for live and video content. Use fixed unlock for this content.',
    })
  }

  try {
    const [info, funded] = await Promise.all([
      arcClient.readContract({
        address: vault as `0x${string}`,
        abi: STREAM_VAULT_ABI,
        functionName: 'streamInfo',
      }) as Promise<readonly [`0x${string}`, `0x${string}`, bigint, bigint, bigint, bigint, boolean, bigint, bigint]>,
      arcClient.readContract({
        address: vault as `0x${string}`,
        abi: STREAM_VAULT_ABI,
        functionName: 'isFunded',
      }) as Promise<boolean>,
    ])
    const [, recipient, totalAmount, startTime, endTime,, cancelled] = info
    const now = BigInt(Math.floor(Date.now() / 1000))
    if (!funded) return res.status(402).json({ ok: false, error: 'Nano meter is not funded yet.' })
    if (cancelled) return res.status(402).json({ ok: false, error: 'This nano meter was cancelled.' })
    if (recipient.toLowerCase() !== entry.creator.toLowerCase()) {
      return res.status(403).json({ ok: false, error: 'This stream does not pay the content creator.' })
    }
    if (totalAmount < BigInt(Math.max(1, entry.capRaw))) {
      return res.status(402).json({ ok: false, error: 'Nano meter budget is below this content cap.' })
    }
    if (now < startTime) {
      return res.status(425).json({ ok: false, error: 'Nano meter is confirmed and will open shortly.' })
    }
    if (now >= endTime) {
      return res.status(402).json({ ok: false, error: 'This nano meter has ended.' })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(503).json({ ok: false, error: `Could not verify nano meter: ${message.slice(0, 160)}` })
  }

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content, coverImage: entry.coverImage })
}

async function verifyCheckpointVaultState(contentId: string, entry: ContentEntry, vault: string, options: { allowRefunded?: boolean } = {}) {
  const code = await arcClient.getBytecode({ address: vault as `0x${string}` }).catch(() => undefined)
  if (!code || code === '0x') {
    throw new Error('Checkpoint escrow is not active on Arc yet. Start pay-as-you-read again.')
  }

  const info = await arcClient.readContract({
    address: vault as `0x${string}`,
    abi: CHECKPOINT_VAULT_ABI,
    functionName: 'vaultInfo',
  }) as readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, bigint, bigint, bigint, boolean, boolean]

  const sender = info[0]
  const recipient = info[1]
  const relayer = info[3]
  const vaultContentId = info[4]
  const totalAmount = info[5]
  const releasedAmount = info[6]
  const refundableAmount = info[7]
  const refunded = info[8]
  const funded = info[9]
  const rawKey = process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY
  if (!rawKey) throw new Error('Checkpoint relayer is not configured.')
  if (recipient.toLowerCase() !== entry.creator.toLowerCase()) {
    throw new Error('This checkpoint escrow does not pay the content creator.')
  }
  if (vaultContentId.toLowerCase() !== toContentBytes32(contentId).toLowerCase()) {
    throw new Error('This checkpoint escrow is for a different content item.')
  }
  if (totalAmount < BigInt(Math.max(1, entry.capRaw))) {
    throw new Error('Checkpoint escrow budget is below this content cap.')
  }
  if (!funded) throw new Error('Checkpoint escrow is not funded yet.')
  if (refunded && !options.allowRefunded) throw new Error('This checkpoint escrow has been refunded.')
  if (!isAddress(relayer)) throw new Error('Checkpoint escrow relayer is invalid.')

  return {
    sender,
    totalAmount: totalAmount.toString(),
    releasedAmount: releasedAmount.toString(),
    refundableAmount: refundableAmount.toString(),
    refunded,
  }
}

async function findCheckpointUnlockOnChain(contentId: string, entry: ContentEntry, walletAddress: string) {
  const wallet = cleanWalletAddress(walletAddress)
  if (!CHECKPOINT_FACTORY_ADDRESS || !isAddress(CHECKPOINT_FACTORY_ADDRESS) || !wallet || !isAddress(wallet)) return null
  const targetContentId = toContentBytes32(contentId).toLowerCase()
  const logs = await arcClient.getLogs({
    address: CHECKPOINT_FACTORY_ADDRESS as `0x${string}`,
    event: CHECKPOINT_VAULT_CREATED_EVENT,
    args: { sender: wallet as `0x${string}` },
    fromBlock: 0n,
    toBlock: 'latest',
  }).catch(() => [])

  for (const log of logs.reverse()) {
    const vault = log.args.vault
    const logContentId = String(log.args.contentId ?? '').toLowerCase()
    if (!vault || logContentId !== targetContentId) continue
    try {
      const state = await verifyCheckpointVaultState(contentId, entry, vault)
      if (state.sender.toLowerCase() !== wallet) continue
      await writeCheckpointUnlock({ contentId, walletAddress: wallet, vaultAddress: vault, createdAt: Date.now() })
      return { vaultAddress: vault, state }
    } catch {
      continue
    }
  }
  return null
}

export async function getContentCheckpointEscrow(req: Request, res: Response) {
  const { id, vault } = req.query as { id?: string; vault?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
  if (!vault || !isAddress(vault)) {
    return res.status(400).json({ ok: false, error: 'A valid checkpoint escrow is required.' })
  }

  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }
  if (entry.type === 'url' || entry.category === 'live-scores') {
    return res.status(400).json({ ok: false, error: 'Checkpoint escrow is only for in-page articles, books, and HashWatch videos.' })
  }

  let checkpointState: Awaited<ReturnType<typeof verifyCheckpointVaultState>> | undefined
  try {
    checkpointState = await verifyCheckpointVaultState(id, entry, vault)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(503).json({ ok: false, error: `Could not verify checkpoint escrow: ${message.slice(0, 160)}` })
  }

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content, coverImage: entry.coverImage, ...checkpointState })
}

export async function getCreatorCheckpointVault(req: Request, res: Response) {
  const { contentId, walletAddress } = req.query as { contentId?: string; walletAddress?: string }
  const wallet = cleanWalletAddress(walletAddress)
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !wallet || !isAddress(wallet)) {
    return res.status(400).json({ ok: false, error: 'Valid content ID and reader wallet are required.' })
  }
  const entry = await readContentEntry(contentId)
  if (!entry) return res.status(404).json({ ok: false, error: 'Content not found.' })
  const saved = await readCheckpointUnlock(contentId, wallet)
  if (!saved || !isAddress(saved.vaultAddress)) {
    const discovered = await findCheckpointUnlockOnChain(contentId, entry, wallet)
    if (!discovered) return res.status(404).json({ ok: false, error: 'No previous pay-as-you-read session found.' })
    return res.json({ ok: true, vaultAddress: discovered.vaultAddress, ...discovered.state })
  }
  try {
    const state = await verifyCheckpointVaultState(contentId, entry, saved.vaultAddress)
    if (state.sender.toLowerCase() !== wallet) return res.status(403).json({ ok: false, error: 'This checkpoint belongs to another reader wallet.' })
    return res.json({ ok: true, vaultAddress: saved.vaultAddress, ...state })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(404).json({ ok: false, error: message.slice(0, 180) })
  }
}

export async function saveCreatorCheckpointVault(req: Request, res: Response) {
  const contentId = String(req.body?.contentId ?? '').trim()
  const walletAddress = cleanWalletAddress(req.body?.walletAddress)
  const vaultAddress = String(req.body?.vaultAddress ?? '').trim()
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !walletAddress || !isAddress(walletAddress) || !isAddress(vaultAddress)) {
    return res.status(400).json({ ok: false, error: 'Valid content ID, reader wallet, and checkpoint vault are required.' })
  }
  const entry = await readContentEntry(contentId)
  if (!entry) return res.status(404).json({ ok: false, error: 'Content not found.' })
  try {
    const state = await verifyCheckpointVaultState(contentId, entry, vaultAddress)
    if (state.sender.toLowerCase() !== walletAddress) return res.status(403).json({ ok: false, error: 'This checkpoint belongs to another reader wallet.' })
    await writeCheckpointUnlock({ contentId, walletAddress, vaultAddress, createdAt: Date.now() })
    return res.json({ ok: true, vaultAddress, ...state })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return res.status(400).json({ ok: false, error: message.slice(0, 180) })
  }
}

export async function getContentX402(req: PaidRequest, res: Response) {
  const { id } = req.query as { id?: string }
  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }
  const middleware = await creatorGatewayMiddleware(entry)
  return middleware(req, res, () => {
    return res.status(200).json({
      ok: true,
      type: entry.type,
      content: entry.content,
      coverImage: entry.coverImage,
      payment: req.payment ?? null,
    })
  })
}

export async function unlockContentX402WithAgent(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  const { contentId, agentSlug } = (req.body ?? {}) as { contentId?: string; agentSlug?: string }
  const safeAgentSlug = normalizeAgentSlug(agentSlug)

  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH) {
    return res.status(400).json({ ok: false, error: 'Valid content ID is required.' })
  }
  if (!safeAgentSlug) {
    return res.status(400).json({ ok: false, error: 'Choose an agent wallet before unlocking.' })
  }

  const entry = await readContentEntry(contentId)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
  }
  const maxAmount = Math.max(0.000001, Math.ceil(Math.max(1, Number(entry.capRaw) || 0)) / 1_000_000)
  const serviceUrl = `${baseUrl()}/api/get-content-x402?id=${encodeURIComponent(contentId)}`

  try {
    const walletRecord = await getAgentWalletRecord(safeAgentSlug)
    const walletAddress = walletRecord?.walletAddress ?? ''
    const existingUnlock = await readCreatorUnlock(contentId, safeAgentSlug, walletAddress)
      ?? await findLegacyCreatorUnlock(contentId, safeAgentSlug, walletAddress)
    if (existingUnlock) {
      return res.status(200).json({
        ok: true,
        restored: true,
        type: entry.type,
        content: entry.content,
        coverImage: entry.coverImage,
        payment: existingUnlock.paymentTransaction ? { transaction: existingUnlock.paymentTransaction } : null,
        receiptActivityId: existingUnlock.receiptActivityId || null,
        walletAddress: existingUnlock.walletAddress || walletAddress,
      })
    }

    const paid = await payAgentX402Service({
      agentSlug: safeAgentSlug,
      sellerAgentSlug: '',
      serviceUrl,
      maxAmount,
      paymentChain: CREATOR_AGENT_X402_PAY_CHAIN,
      spendTitle: 'Unlocked creator content',
      spendDetail: `Paid ${maxAmount.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} USDC to unlock ${shortId(contentId)}`,
      resultTitle: 'Creator content unlocked',
      resultDetail: entry.type === 'url' ? 'Private link revealed after x402 payment' : 'Article revealed after x402 payment',
      result: { contentId, type: entry.type, creator: entry.creator },
      appendResultActivity: true,
    })
    const response = paid.response as CreatorUnlockResponse | undefined
    if (response?.ok === false) {
      return res.status(502).json({ ok: false, error: response.error ?? 'Creator content service rejected the payment.' })
    }

    await writeCreatorUnlock({
      contentId,
      agentSlug: safeAgentSlug,
      walletAddress: paid.walletAddress,
      paymentTransaction: response?.payment?.transaction ?? paid.proof?.transaction ?? '',
      receiptActivityId: paid.receiptActivityId ?? '',
      unlockedAt: Date.now(),
    })

    return res.status(200).json({
      ok: true,
      restored: false,
      type: response?.type ?? entry.type,
      content: response?.content ?? entry.content,
      coverImage: entry.coverImage,
      payment: response?.payment ?? null,
      receiptActivityId: paid.receiptActivityId ?? null,
      walletAddress: paid.walletAddress,
    })
  } catch (err) {
    const error = err as Error & { status?: number; code?: string }
    const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502
    return res.status(status).json({
      ok: false,
      code: error.code,
      error: error.message || 'Circle Gateway payment failed.',
    })
  }
}

export async function listCreatorEarnings(req: Request, res: Response) {
  const creator = String(req.query.creator ?? '').trim()
  if (!isAddress(creator)) return res.status(400).json({ ok: false, error: 'Valid creator wallet is required.' })

  if (pool) {
    await ensureSchema()
    const fixedResult = await pool.query(
      `select
         u.content_id,
         u.wallet_address,
         u.payment_transaction,
         u.receipt_activity_id,
         u.unlocked_at,
         c.title,
         c.cap_raw
       from streampay_creator_unlocks u
       join streampay_creator_content c on c.content_id = u.content_id
       where lower(c.creator) = lower($1)
       order by u.unlocked_at desc
       limit 80`,
      [creator],
    )
    const checkpointResult = await pool.query(
      `select *
       from streampay_checkpoint_unlocks
       order by updated_at desc
       limit 200`,
    )
    const checkpointRows = (await Promise.all(
      checkpointResult.rows.map(row => checkpointUnlockToEarning(rowToCheckpointUnlockEntry(row), creator)),
    )).filter(Boolean)
    const rows = [
      ...fixedResult.rows.map(unlockRowToEarning),
      ...checkpointRows,
    ].sort((a, b) => (b?.unlockedAt ?? 0) - (a?.unlockedAt ?? 0)).slice(0, 120)
    return res.json({ ok: true, fixedUnlocks: rows })
  }

  const fixedRows = Array.from(unlockStore.values())
    .map(unlock => {
      const entry = store.get(unlock.contentId) ?? OFFICIAL_CONTENT[unlock.contentId]
      if (!entry || entry.creator.toLowerCase() !== creator.toLowerCase()) return null
      return {
        kind: 'fixed' as const,
        contentId: unlock.contentId,
        title: entry.title || 'Creator content',
        amount: Math.max(0.000001, Math.ceil(Math.max(1, Number(entry.capRaw) || 0)) / 1_000_000),
        asset: 'USDC',
        payer: unlock.walletAddress,
        receiptActivityId: unlock.receiptActivityId,
        transaction: unlock.paymentTransaction,
        unlockedAt: unlock.unlockedAt,
      }
    })
    .filter(Boolean)
  const checkpointRows = (await Promise.all(
    Array.from(checkpointUnlockStore.values()).map(unlock => checkpointUnlockToEarning(unlock, creator)),
  )).filter(Boolean)
  const rows = [...fixedRows, ...checkpointRows]
    .sort((a, b) => (b?.unlockedAt ?? 0) - (a?.unlockedAt ?? 0))
    .slice(0, 120)
  return res.json({ ok: true, fixedUnlocks: rows })
}

export async function getCreatorBook(req: Request, res: Response) {
  const id = String(req.query.id ?? '').trim()
  const book = OFFICIAL_EBOOK_BY_ID.get(id)
  if (!book) return res.status(404).json({ ok: false, error: 'Book not found.' })
  if (!book.gutenbergId) {
    return res.status(200).json({
      ok: true,
      id,
      title: book.title,
      description: book.description,
      source: book.source,
      coverImage: book.coverUrl || openLibraryCover(book.identifier, book.title, book.tag),
      text: cleanGutenbergText(book.previewText),
      preview: true,
    })
  }
  try {
    const text = await fetchOfficialBookText(book.gutenbergId)
    return res.status(200).json({
      ok: true,
      id,
      title: book.title,
      description: book.description,
      source: book.source,
      coverImage: book.coverUrl || openLibraryCover(book.identifier, book.title, book.tag),
      gutenbergId: book.gutenbergId,
      text,
    })
  } catch (err) {
    const fallback = cleanGutenbergText(FALLBACK_BOOK_TEXT_BY_GUTENBERG_ID[book.gutenbergId] ?? '')
    if (fallback.length > 500) {
      bookCache.set(book.gutenbergId, { ts: Date.now(), text: fallback })
      return res.status(200).json({
        ok: true,
        id,
        title: book.title,
        description: book.description,
        source: book.source,
        coverImage: book.coverUrl || openLibraryCover(book.identifier, book.title, book.tag),
        gutenbergId: book.gutenbergId,
        text: fallback,
        fallback: true,
      })
    }
    const message = err instanceof Error ? err.message : 'Book text unavailable.'
    return res.status(502).json({ ok: false, error: message.slice(0, 180) })
  }
}

async function readCreatorSocial(contentId: string, walletAddress = '') {
  const wallet = cleanWalletAddress(walletAddress)
  await ensureSchema()
  if (pool) {
    const [reactionRows, commentRows] = await Promise.all([
      pool.query(
        `select
           count(*) filter (where reaction = 'up')::int as up_count,
           count(*) filter (where reaction = 'down')::int as down_count,
           max(reaction) filter (where lower(wallet_address) = $2) as my_reaction
         from streampay_creator_reactions
         where content_id = $1`,
        [contentId, wallet],
      ),
      pool.query(
        `select
           c.comment_id,
           c.wallet_address,
           c.body,
           c.created_at,
           count(cr.*) filter (where cr.reaction = 'up')::int as up_count,
           count(cr.*) filter (where cr.reaction = 'down')::int as down_count,
           max(cr.reaction) filter (where lower(cr.wallet_address) = $2) as my_reaction
         from streampay_creator_comments c
         left join streampay_creator_comment_reactions cr on cr.comment_id = c.comment_id
         where c.content_id = $1
         group by c.comment_id
         order by c.created_at desc
         limit 50`,
        [contentId, wallet],
      ),
    ])
    const reaction = reactionRows.rows[0] ?? {}
    return {
      upCount: Number(reaction.up_count ?? 0),
      downCount: Number(reaction.down_count ?? 0),
      myReaction: cleanReaction(reaction.my_reaction),
      comments: commentRows.rows.map(row => ({
        id: String(row.comment_id),
        walletAddress: String(row.wallet_address ?? ''),
        body: String(row.body ?? ''),
        createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
        upCount: Number(row.up_count ?? 0),
        downCount: Number(row.down_count ?? 0),
        myReaction: cleanReaction(row.my_reaction),
      })),
    }
  }

  const reactions = Array.from(reactionStore.values()).filter(item => item.contentId === contentId)
  const comments = Array.from(commentStore.values())
    .filter(item => item.contentId === contentId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map(comment => {
      const commentReactions = Array.from(commentReactionStore.values()).filter(item => item.commentId === comment.id)
      return {
        id: comment.id,
        walletAddress: comment.walletAddress,
        body: comment.body,
        createdAt: comment.createdAt,
        upCount: commentReactions.filter(item => item.reaction === 'up').length,
        downCount: commentReactions.filter(item => item.reaction === 'down').length,
        myReaction: cleanReaction(commentReactions.find(item => item.walletAddress === wallet)?.reaction),
      }
    })
  return {
    upCount: reactions.filter(item => item.reaction === 'up').length,
    downCount: reactions.filter(item => item.reaction === 'down').length,
    myReaction: cleanReaction(reactions.find(item => item.walletAddress === wallet)?.reaction),
    comments,
  }
}

export async function getCreatorSocial(req: Request, res: Response) {
  const contentId = String(req.query.id ?? '').trim()
  const walletAddress = cleanWalletAddress(req.query.wallet)
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH) return res.status(400).json({ ok: false, error: 'Invalid content id.' })
  return res.json({ ok: true, ...(await readCreatorSocial(contentId, walletAddress)) })
}

async function readCreatorContentViews(contentId: string) {
  if (pool) {
    await ensureSchema()
    const result = await pool.query(
      `select coalesce(sum(view_count), 0)::int as view_count
       from streampay_creator_content_views
       where content_id = $1`,
      [contentId],
    )
    return Number(result.rows[0]?.view_count ?? 0)
  }
  return Array.from(contentViewStore.values())
    .filter(item => item.contentId === contentId)
    .reduce((sum, item) => sum + item.count, 0)
}

export async function recordCreatorContentView(req: Request, res: Response) {
  const contentId = String(req.body?.contentId ?? '').trim()
  const viewerKey = cleanViewerKey(req.body?.viewerKey)
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !viewerKey) {
    return res.status(400).json({ ok: false, error: 'Invalid content view.' })
  }
  const entry = await readContentEntry(contentId)
  if (!entry) return res.status(404).json({ ok: false, error: 'Content not found.' })
  await ensureSchema()
  if (pool) {
    await pool.query(
      `insert into streampay_creator_content_views (content_id, viewer_key, view_count, created_at, updated_at)
       values ($1, $2, 1, now(), now())
       on conflict (content_id, viewer_key) do update set updated_at = now()`,
      [contentId, viewerKey],
    )
  } else {
    const key = `${contentId}:${viewerKey}`
    const existing = contentViewStore.get(key)
    contentViewStore.set(key, {
      contentId,
      viewerKey,
      count: existing?.count ?? 1,
      updatedAt: Date.now(),
    })
  }
  return res.json({ ok: true, viewCount: await readCreatorContentViews(contentId) })
}

export async function setCreatorReaction(req: Request, res: Response) {
  const contentId = String(req.body?.contentId ?? '').trim()
  const walletAddress = cleanWalletAddress(req.body?.walletAddress)
  const reaction = cleanReaction(req.body?.reaction)
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !walletAddress) return res.status(400).json({ ok: false, error: 'Invalid content or wallet.' })
  if (!(await hasWalletUnlockedContent(contentId, walletAddress))) return res.status(403).json({ ok: false, error: 'Unlock this content before reacting.' })
  await ensureSchema()
  if (pool) {
    if (reaction) {
      await pool.query(
        `insert into streampay_creator_reactions (content_id, wallet_address, reaction, updated_at)
         values ($1, $2, $3, now())
         on conflict (content_id, wallet_address) do update set reaction = excluded.reaction, updated_at = now()`,
        [contentId, walletAddress, reaction],
      )
    } else {
      await pool.query(`delete from streampay_creator_reactions where content_id = $1 and wallet_address = $2`, [contentId, walletAddress])
    }
  } else {
    const key = `${contentId}:${walletAddress}`
    if (reaction) reactionStore.set(key, { contentId, walletAddress, reaction, updatedAt: Date.now() })
    else reactionStore.delete(key)
  }
  return res.json({ ok: true, ...(await readCreatorSocial(contentId, walletAddress)) })
}

export async function addCreatorComment(req: Request, res: Response) {
  const contentId = String(req.body?.contentId ?? '').trim()
  const walletAddress = cleanWalletAddress(req.body?.walletAddress)
  const body = cleanCommentBody(req.body?.body)
  if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !walletAddress || body.length < 2) return res.status(400).json({ ok: false, error: 'Write a short comment first.' })
  if (!(await hasWalletUnlockedContent(contentId, walletAddress))) return res.status(403).json({ ok: false, error: 'Unlock this content before commenting.' })
  const commentId = randomUUID()
  await ensureSchema()
  if (pool) {
    await pool.query(
      `insert into streampay_creator_comments (comment_id, content_id, wallet_address, body, created_at, updated_at)
       values ($1, $2, $3, $4, now(), now())`,
      [commentId, contentId, walletAddress, body],
    )
  } else {
    const now = Date.now()
    commentStore.set(commentId, { id: commentId, contentId, walletAddress, body, createdAt: now, updatedAt: now })
  }
  return res.json({ ok: true, ...(await readCreatorSocial(contentId, walletAddress)) })
}

export async function setCreatorCommentReaction(req: Request, res: Response) {
  const contentId = String(req.body?.contentId ?? '').trim()
  const commentId = String(req.body?.commentId ?? '').trim()
  const walletAddress = cleanWalletAddress(req.body?.walletAddress)
  const reaction = cleanReaction(req.body?.reaction)
  if (!contentId || !commentId || !walletAddress) return res.status(400).json({ ok: false, error: 'Invalid comment reaction.' })
  if (!(await hasWalletUnlockedContent(contentId, walletAddress))) return res.status(403).json({ ok: false, error: 'Unlock this content before reacting.' })
  await ensureSchema()
  if (pool) {
    const comment = await pool.query(`select 1 from streampay_creator_comments where comment_id = $1 and content_id = $2 limit 1`, [commentId, contentId])
    if (!comment.rowCount) return res.status(404).json({ ok: false, error: 'Comment not found.' })
    if (reaction) {
      await pool.query(
        `insert into streampay_creator_comment_reactions (comment_id, wallet_address, reaction, updated_at)
         values ($1, $2, $3, now())
         on conflict (comment_id, wallet_address) do update set reaction = excluded.reaction, updated_at = now()`,
        [commentId, walletAddress, reaction],
      )
    } else {
      await pool.query(`delete from streampay_creator_comment_reactions where comment_id = $1 and wallet_address = $2`, [commentId, walletAddress])
    }
  } else {
    if (!commentStore.has(commentId)) return res.status(404).json({ ok: false, error: 'Comment not found.' })
    const key = `${commentId}:${walletAddress}`
    if (reaction) commentReactionStore.set(key, { commentId, walletAddress, reaction, updatedAt: Date.now() })
    else commentReactionStore.delete(key)
  }
  return res.json({ ok: true, ...(await readCreatorSocial(contentId, walletAddress)) })
}

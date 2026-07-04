/**
 * /api/store-content  POST - creator uploads content/URL before sharing gate link
 * /api/get-content    GET  - viewer fetches after USDC approval is verified on Arc
 *
 * Storage: in-memory Map. For production replace with Redis or Postgres.
 */

import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import {
  createPublicClient, http, defineChain,
  parseAbi, isAddress, keccak256, toBytes, verifyMessage, verifyTypedData, hashTypedData,
  type Address, type Hex,
} from 'viem'
import type { NextFunction } from 'express'
import { getAgentWalletRecord, payAgentX402Service } from '../../../api/agent-wallet.js'
import { listAgentActivity } from '../../../api/agent-activity.js'
import { getPolyWorldcupNewsFeed, polyWorldcupArticleId } from '../../../api/poly-worldcup-news.js'

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
const ERC1271_ABI = parseAbi([
  'function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)',
])
const ERC1271_MAGIC_VALUE = '0x1626ba7e'

type ContentEntry = {
  type: 'text' | 'url' | 'scores' | 'book'
  content: string
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
  unlockedAt: number
}

const store = new Map<string, ContentEntry>()
const unlockStore = new Map<string, CreatorUnlockEntry>()
const reactionStore = new Map<string, { contentId: string; walletAddress: string; reaction: 'up' | 'down'; updatedAt: number }>()
const commentStore = new Map<string, { id: string; contentId: string; walletAddress: string; body: string; createdAt: number; updatedAt: number }>()
const commentReactionStore = new Map<string, { commentId: string; walletAddress: string; reaction: 'up' | 'down'; updatedAt: number }>()
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
  type?: 'text' | 'url' | 'scores'
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
  identifier: string
  gutenbergId: string
}> = [
  {
    id: 'ebook-pride-prejudice',
    title: 'Pride and Prejudice',
    description: 'A sharp romance about love, class, first impressions, and second chances.',
    tag: 'Romance',
    identifier: 'ISBN:9780141439518',
    gutenbergId: '1342',
  },
  {
    id: 'ebook-dracula',
    title: 'Dracula',
    description: 'A gothic horror classic with journals, letters, pursuit, and dread.',
    tag: 'Horror',
    identifier: 'ISBN:9780486411095',
    gutenbergId: '345',
  },
  {
    id: 'ebook-frankenstein',
    title: 'Frankenstein',
    description: 'A tragic creation story about ambition, loneliness, and responsibility.',
    tag: 'Tragedy',
    identifier: 'ISBN:9780486282114',
    gutenbergId: '84',
  },
  {
    id: 'ebook-sherlock-adventures',
    title: 'The Adventures of Sherlock Holmes',
    description: 'Brisk detective mysteries built around deduction, disguise, and suspense.',
    tag: 'Mystery',
    identifier: 'ISBN:9780486474915',
    gutenbergId: '1661',
  },
  {
    id: 'ebook-jane-eyre',
    title: 'Jane Eyre',
    description: 'A passionate coming-of-age romance with secrets, independence, and moral tension.',
    tag: 'Love',
    identifier: 'ISBN:9780141441146',
    gutenbergId: '1260',
  },
  {
    id: 'ebook-wuthering-heights',
    title: 'Wuthering Heights',
    description: 'A stormy tale of obsession, revenge, and destructive love.',
    tag: 'Drama',
    identifier: 'ISBN:9780141439556',
    gutenbergId: '768',
  },
  {
    id: 'ebook-dorian-gray',
    title: 'The Picture of Dorian Gray',
    description: 'A stylish psychological thriller about beauty, vanity, and consequence.',
    tag: 'Thriller',
    identifier: 'ISBN:9780141439570',
    gutenbergId: '174',
  },
  {
    id: 'ebook-alice-wonderland',
    title: 'Alice in Wonderland',
    description: 'A funny, strange, endlessly imaginative trip through nonsense and wonder.',
    tag: 'Funny',
    identifier: 'ISBN:9780486275437',
    gutenbergId: '11',
  },
  {
    id: 'ebook-frederick-douglass',
    title: 'Narrative of the Life of Frederick Douglass',
    description: 'A true-life account of survival, literacy, freedom, and moral courage.',
    tag: 'True Life',
    identifier: 'ISBN:9780486284996',
    gutenbergId: '23',
  },
  {
    id: 'ebook-time-machine',
    title: 'The Time Machine',
    description: 'A compact sci-fi adventure through futurism, fear, and social collapse.',
    tag: 'Sci-Fi',
    identifier: 'ISBN:9780486284729',
    gutenbergId: '35',
  },
]

function openLibraryCover(isbn: string) {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn.replace(/^ISBN:/i, ''))}-L.jpg`
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
<p><em>If you are opening a terminal for the first time, this guide is for you.</em> The goal is simple: one Mac or Windows laptop, one terminal, one GitHub identity, and the main AI/deployment tools connected before you start building.</p>
<h2>What you are setting up</h2>
<p><strong>Claude Code</strong> is the AI engineer you run in your terminal. <strong>OpenAI Codex</strong> is a second audit brain you can use when you want another model to review the repo. <strong>GitHub</strong> stores your code. <strong>Vercel</strong> is great for frontends. <strong>Railway</strong> is useful for backends, APIs, bots, and databases. <strong>Render</strong> is useful when you want frontend and backend in one hosted service.</p>
<p>The benefit is speed. Once this is done, a beginner can open a folder, ask Claude Code to build, use Codex to audit, push to GitHub, and deploy from the same terminal without learning five separate dashboards first.</p>
<h2>Create accounts first</h2>
<p>Create these accounts before installing tools. Use the same email where possible so browser login and GitHub SSO stay clean.</p>
<ul>
  <li><a href="https://claude.ai">Claude</a> - upgrade to Claude Pro or Max if you want Claude Code through your subscription.</li>
  <li><a href="https://github.com/signup">GitHub</a> - this becomes your public builder identity and repo home.</li>
  <li><a href="https://vercel.com/signup">Vercel</a> - sign up with GitHub for automatic frontend deploys.</li>
  <li><a href="https://railway.app">Railway</a> - sign up with GitHub for backend/API deploys.</li>
  <li><a href="https://render.com">Render</a> - sign up with GitHub for full-stack web services.</li>
  <li><a href="https://developers.openai.com/codex">OpenAI Codex</a> - add this when you want a second code auditor.</li>
</ul>
<h2>Install a code editor</h2>
<p>Use <a href="https://code.visualstudio.com">VS Code</a> first. It is free, standard, and works on Mac and Windows. <a href="https://cursor.com">Cursor</a> is also useful if you want an AI-native editor, but you do not need it on day one.</p>
<h2>Open the right terminal</h2>
<p>On Mac, press Cmd + Space, type Terminal, and open it. On Windows, install Windows Terminal from the Microsoft Store, open it, and start with PowerShell. After Git is installed, Git Bash will also be available inside Windows Terminal.</p>
<h2>Install Node.js</h2>
<p>Node gives you <strong>npm</strong>, the package manager used by Claude Code, Vercel CLI, Railway CLI, and many web projects.</p>
<p>On Mac, install Homebrew from <a href="https://brew.sh">brew.sh</a>, then run:</p>
<pre><code>brew --version</code></pre>
<pre><code>brew install node</code></pre>
<p>On Windows, install the LTS version from <a href="https://nodejs.org">nodejs.org</a>, accept the defaults, then close and reopen your terminal.</p>
<p>Verify Node and npm:</p>
<pre><code>node --version</code></pre>
<pre><code>npm --version</code></pre>
<p>You want Node 18 or higher.</p>
<h2>Install Git</h2>
<p>Git saves versions of your code and lets your AI agent push work to GitHub.</p>
<p>On Mac, check first:</p>
<pre><code>git --version</code></pre>
<p>If it is missing, install it:</p>
<pre><code>brew install git</code></pre>
<p>On Windows, install Git from <a href="https://git-scm.com/download/win">git-scm.com/download/win</a> and accept the defaults. Then verify:</p>
<pre><code>git --version</code></pre>
<h2>Install Claude Code</h2>
<p>Use the official <a href="https://docs.anthropic.com/en/docs/claude-code/setup">Claude Code setup guide</a> for the latest installer. Anthropic now recommends native installers for a cleaner setup, especially on Windows.</p>
<p>After installing, verify:</p>
<pre><code>claude --version</code></pre>
<p>Then start Claude Code:</p>
<pre><code>claude</code></pre>
<p>Choose the Claude Pro or Max login flow, finish the browser sign-in, then type <code>/exit</code> when you are done. From now on, running <code>claude</code> inside any project folder launches your AI engineer inside that folder.</p>
<h2>Connect GitHub to the terminal</h2>
<p>Install the GitHub CLI from <a href="https://cli.github.com">cli.github.com</a>. On Mac with Homebrew:</p>
<pre><code>brew install gh</code></pre>
<p>On Windows:</p>
<pre><code>winget install --id GitHub.cli</code></pre>
<p>Log in:</p>
<pre><code>gh auth login</code></pre>
<p>Pick GitHub.com, HTTPS, and browser login. When it gives you a one-time code, paste it into the browser and authorize. Verify:</p>
<pre><code>gh auth status</code></pre>
<p>This is the link that lets Claude Code create repos, commit, and push without you clicking through GitHub every time.</p>
<h2>Add Codex as a second auditor</h2>
<p><em>You can skip this until your first project is working.</em> When ready, install Codex from the official <a href="https://developers.openai.com/codex">OpenAI Codex docs</a>. Package names and recommended surfaces can change, so use the current OpenAI page instead of copying an old command from a random guide.</p>
<p>A strong workflow is: Claude Code builds, Codex audits, Claude Code fixes. Ask Codex: <em>audit this repo for bugs, broken flows, dead code, and security risks.</em> Then paste the report back to Claude Code.</p>
<h2>Connect Vercel for frontends</h2>
<p>Vercel is usually the fastest home for landing pages and React frontends. Install the CLI from the official <a href="https://vercel.com/docs/cli">Vercel CLI docs</a>. With npm:</p>
<pre><code>npm install -g vercel</code></pre>
<p>Log in:</p>
<pre><code>vercel login</code></pre>
<p>Deploy from a project folder:</p>
<pre><code>vercel</code></pre>
<p>After the first setup, GitHub pushes can trigger deploys automatically from the Vercel dashboard.</p>
<h2>Connect Railway for APIs and databases</h2>
<p>Railway is useful when your app has a backend, API, bot, worker, cron, or database. Install from the official <a href="https://docs.railway.com/reference/cli-api">Railway CLI docs</a>. With npm:</p>
<pre><code>npm install -g @railway/cli</code></pre>
<p>Log in:</p>
<pre><code>railway login</code></pre>
<p>Inside a project, link it to a Railway service:</p>
<pre><code>railway link</code></pre>
<p>Deploy:</p>
<pre><code>railway up</code></pre>
<h2>Connect Render for full-stack services</h2>
<p>Render is mostly dashboard-driven. Create the account with GitHub, then create a Web Service from a GitHub repo. Set build and start commands in the Render dashboard, then add environment variables there. Keep the official <a href="https://render.com/docs">Render docs</a> open for the service type you are deploying.</p>
<p>For beginners: use Vercel for frontend-only projects, Railway for backend-heavy projects, and Render when one service needs to run both frontend and backend together.</p>
<h2>Your daily build loop</h2>
<p>Once the setup is done, every project starts the same way:</p>
<pre><code>mkdir -p ~/projects/my-new-build</code></pre>
<pre><code>cd ~/projects/my-new-build</code></pre>
<pre><code>claude</code></pre>
<p>Then speak plainly: <em>Build the first version, initialize git, create a private GitHub repo with gh, push it, and tell me the repo URL.</em></p>
<p>When the feature works, run a second pass: <em>Audit the codebase for broken flows, mobile issues, missing error states, and deploy risks.</em> If you also use Codex, ask it the same thing and compare both reports.</p>
<h2>Security rules</h2>
<ul>
  <li>Never paste API keys, bearer tokens, private keys, seed phrases, or production secrets into any AI chat.</li>
  <li>Put secrets in Vercel, Railway, or Render environment variables. Do not hardcode them.</li>
  <li>Make sure <code>.env</code> is in <code>.gitignore</code> before your first commit.</li>
  <li>Use GitHub SSO in your real browser for hosting accounts.</li>
  <li>Back up local <code>.env</code> files in a password manager.</li>
  <li>Rotate keys often during hackathons and live testing.</li>
</ul>
<h2>Ready state</h2>
<p>You are ready to build when <code>node --version</code>, <code>npm --version</code>, <code>git --version</code>, <code>claude --version</code>, and <code>gh auth status</code> all work in one terminal.</p>
<p>That is the real beginner unlock. Not a hello-world demo. A working local command center where AI, code, GitHub, and deployment all meet.</p>
<p><em>By SHY.</em></p>
`.trim()

const OFFICIAL_CONTENT: Record<string, ContentEntry> = {
  'developer-terminal-setup': {
    type: 'text',
    content: DEVELOPER_TERMINAL_SETUP_ARTICLE,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_DEVELOPER_GUIDE_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock',
    title: 'Before You Build: AI Terminal Setup',
    description: 'A first-time builder guide to connecting Claude Code, Codex, GitHub, Vercel, Railway, and Render from one Mac or Windows terminal.',
    authorName: 'SHY',
    xHandle: 'Hash_PayLink',
    coverImage: '/brand/world-globe.png',
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
  ...Object.fromEntries(OFFICIAL_EBOOKS.map((book, index) => [book.id, {
    type: 'book' as const,
    content: `gutenberg:${book.gutenbergId}`,
    creator: SAFE_OFFICIAL_CREATOR,
    capRaw: Number(process.env.CREATOR_EBOOK_PRICE_RAW ?? '100000'),
    rateRaw: 1000,
    mode: 'unlock' as const,
    title: book.title,
    description: book.description,
    authorName: 'Public Domain Reader',
    xHandle: 'Hash_PayLink',
    coverImage: openLibraryCover(book.identifier),
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
        unlocked_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists streampay_creator_unlocks_content_idx on streampay_creator_unlocks (content_id, updated_at desc);
      create index if not exists streampay_creator_unlocks_agent_idx on streampay_creator_unlocks (agent_slug, updated_at desc);
      create index if not exists streampay_creator_unlocks_wallet_idx on streampay_creator_unlocks (wallet_address, updated_at desc);
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
    type: type === 'url' ? 'url' : type === 'scores' ? 'scores' : 'text',
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

function rowToUnlockEntry(row: Record<string, unknown>): CreatorUnlockEntry {
  return {
    contentId: String(row.content_id ?? ''),
    agentSlug: String(row.agent_slug ?? ''),
    walletAddress: String(row.wallet_address ?? ''),
    paymentTransaction: String(row.payment_transaction ?? ''),
    receiptActivityId: String(row.receipt_activity_id ?? ''),
    unlockedAt: row.unlocked_at instanceof Date ? row.unlocked_at.getTime() : Date.now(),
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
    const result = await pool.query(
      `select 1 from streampay_creator_unlocks where content_id = $1 and lower(wallet_address) = $2 limit 1`,
      [contentId, wallet],
    )
    return result.rowCount > 0
  }
  return Array.from(unlockStore.values()).some(unlock => (
    unlock.contentId === contentId && unlock.walletAddress.toLowerCase() === wallet
  ))
}

async function writeCreatorUnlock(entry: CreatorUnlockEntry) {
  const key = unlockKey(entry.contentId, entry.agentSlug, entry.walletAddress)
  if (pool) {
    await ensureSchema()
    await pool.query(
      `insert into streampay_creator_unlocks
        (unlock_key, content_id, agent_slug, wallet_address, payment_transaction, receipt_activity_id, unlocked_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0), now())
       on conflict (unlock_key) do update set
         agent_slug = excluded.agent_slug,
         wallet_address = excluded.wallet_address,
         payment_transaction = excluded.payment_transaction,
         receipt_activity_id = excluded.receipt_activity_id,
         updated_at = now()`,
      [
        key,
        entry.contentId,
        entry.agentSlug,
        entry.walletAddress,
        entry.paymentTransaction,
        entry.receiptActivityId,
        entry.unlockedAt,
      ],
    )
    return
  }
  unlockStore.set(key, entry)
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
  const raw = Math.max(1, Math.round(Number(entry.capRaw) || 0))
  return `$${(raw / 1_000_000).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
}

function isHexSignature(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{130}$/.test(value)
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value
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
  if (category === 'general') return 'crypto'
  return ['worldcup-news', 'live-scores', 'ebooks', 'crypto', 'developers'].includes(category) ? category : 'crypto'
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
    }),
  }
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
  if (type !== 'text' && type !== 'url') {
    return res.status(400).json({ ok: false, error: 'type must be "text" or "url"' })
  }
  if (!isAddress(creator)) {
    return res.status(400).json({ ok: false, error: 'creator must be a valid EVM address' })
  }
  const safeCapRaw = Math.max(0, Number(capRaw) || 0)
  if (!isHexSignature(signature)) {
    return res.status(400).json({ ok: false, error: 'creator signature is invalid' })
  }
  const safeRateRaw = Math.max(0, Number(rateRaw) || 0)
  const safeMode = mode === 'stream' && type !== 'url' ? 'stream' : 'unlock'
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
    type,
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
    category: cleanCategory(category),
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
  const { id, viewer } = req.query as { id?: string; viewer?: string }

  if (!id) return res.status(400).json({ ok: false, error: 'id is required' })
  if (!viewer || !isAddress(viewer)) {
    return res.status(400).json({ ok: false, error: 'viewer must be a valid EVM address' })
  }

  const entry = await readContentEntry(id)
  if (!entry) {
    return res.status(404).json({
      ok: false,
      error: 'Content not found. Ask the creator to re-generate the link.',
    })
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

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content })
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

  return res.status(200).json({ ok: true, type: entry.type, content: entry.content })
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
    const result = await pool.query(
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
    return res.json({ ok: true, fixedUnlocks: result.rows.map(unlockRowToEarning) })
  }

  const rows = Array.from(unlockStore.values())
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
    .sort((a, b) => (b?.unlockedAt ?? 0) - (a?.unlockedAt ?? 0))
  return res.json({ ok: true, fixedUnlocks: rows })
}

export async function getCreatorBook(req: Request, res: Response) {
  const id = String(req.query.id ?? '').trim()
  const book = OFFICIAL_EBOOK_BY_ID.get(id)
  if (!book) return res.status(404).json({ ok: false, error: 'Book not found.' })
  try {
    const text = await fetchOfficialBookText(book.gutenbergId)
    return res.status(200).json({
      ok: true,
      id,
      title: book.title,
      description: book.description,
      source: 'Project Gutenberg public domain text',
      gutenbergId: book.gutenbergId,
      text,
    })
  } catch (err) {
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

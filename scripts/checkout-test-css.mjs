import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../tailwind.config.js'
import {readFileSync} from 'node:fs'
export async function checkoutTestCss(){
 return (await postcss([tailwind(config)]).process(readFileSync('src/index.css','utf8')+'\n'+readFileSync('src/pocket/pocketTheme.css','utf8'),{from:'src/index.css'})).css
}

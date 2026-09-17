import { createCliGrantHandler, cliGrantStorage } from './developer-cli-grants.js'
import { verifyDeveloperProjectOwner } from './developer-projects.js'
export default createCliGrantHandler({ ...cliGrantStorage, owner: verifyDeveloperProjectOwner })

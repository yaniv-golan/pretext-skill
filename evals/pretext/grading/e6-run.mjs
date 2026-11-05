import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const VERIFY = fileURLToPath(new URL('../../../tools/verify', import.meta.url))
const require = createRequire(VERIFY + '/package.json')
const esbuild = require('esbuild')
const f = resolve(process.argv[2])
const out = await esbuild.build({ stdin: { contents: `import C from ${JSON.stringify(f)}; import {createElement as h} from 'react'; import {renderToString} from 'react-dom/server'; console.log(renderToString(h(C,{text:'Hello there world',font:'16px Arial',width:200,lineHeight:22})))`, resolveDir: VERIFY, loader:'js' }, bundle:true, write:false, format:'cjs', platform:'node', jsx:'automatic', nodePaths:[VERIFY+'/node_modules'], logLevel:'silent' })
new Function('require','process', out.outputFiles[0].text)(require, process)

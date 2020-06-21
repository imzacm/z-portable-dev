const importOldJs = async (path: string) => {
  const request = await fetch(path)
  const response = await request.text()
  const window: any = {}
  eval(response)
  return window
}

const HOME_DIR = Deno.env.get('HOME') || Deno.env.get('USERPROFILE')
if (!HOME_DIR) {
  console.error('Cannot detect home directory, please ensure that $HOME or $USERPROFILE is configured correctly')
  Deno.exit(1)
}

const MIRROR_LOCATION = Deno.env.get('MIRROR_LOCATION') || 'https://raw.githubusercontent.com/imzacm/z-portable-dev/master/mirror'

const DEV_DIR = `${ HOME_DIR }/z-dev`

type DEV_File = {
  type: 'file'
  name: string
  contents: string
}

type DEV_Directory = {
  type: 'directory'
  name: string
  contents: (DEV_File | DEV_Directory)[]
}

type DirectoryStructure = (DEV_File | DEV_Directory)[]

const DIR_STRUCTURE: DirectoryStructure = [
  { name: 'bin', type: 'directory', contents: [] },
  { name: 'lib', type: 'directory', contents: [] },
  { name: 'tools', type: 'directory', contents: [] }
]

const pathExists = async (path: string) => {
  try {
    await Deno.stat(path)
    return true
  }
  catch {
    return false
  }
}

const createFile = async (path: string, contents: string) => {
  if (await pathExists(path)) {
    console.error(`"${ path }" already exists, skipping`)
  }
  else {
    console.log(`Creating "${ path }"`)
    await Deno.writeFile(path, new TextEncoder().encode(contents))
  }
}

const createDir = async (path: string, structure: DirectoryStructure) => {
  if (await pathExists(path)) {
    console.error(`"${ path }" already exists, skipping`)
  }
  else {
    console.log(`Creating "${ path }"`)
    await Deno.mkdir(path)
  }
  for (const item of structure) {
    const itemPath = `${ path }/${ item.name }`
    if (item.type === 'directory') {
      await createDir(itemPath, item.contents)
    }
    else if (item.type === 'file') {
      await createFile(itemPath, item.contents)
    }
    else {
      throw new Error('Invalid item type')
    }
  }
}

if (!await pathExists(DEV_DIR)) {
  await createDir(DEV_DIR, DIR_STRUCTURE)
}

const [ action, ...args ] = Deno.args

type PackageType = 'source' | 'prebuilt'

type PackageMeta = {
  type: PackageType
  build?: string[]
  getVersion: {
    api: string
    path: string
  }
  getAsset: {
    api?: string
    path?: string
    url?: string
  }
}

const evaluatePackageMeta = async ({ getVersion, getAsset }: PackageMeta) => {
  const versionRequest = await fetch(getVersion.api)
  const versionResponse = await versionRequest.json()
  const version: string = eval(`versionResponse${ getVersion.path }`)

  if (getAsset.api && getAsset.path) {
    const assetRequest = await fetch(getAsset.api)
    const assetResponse = await assetRequest.json()
    const url: string = eval(`assetResponse${ getAsset.path }`)
    return { version, url }
  }
  else if (getAsset.url) {
    const url: string = eval(`(\`${ getAsset.url }\`)`)
    return { version, url }
  }
  throw new Error('Invalid getAsset')
}

if (action === 'install') {
  const [ type, name ] = args
  const mirrorLocation = MIRROR_LOCATION.endsWith('/') ? MIRROR_LOCATION.substring(0, MIRROR_LOCATION.length - 1) : MIRROR_LOCATION
  const request = await fetch(`${ mirrorLocation }/${ type }s/${ name }.json`)
  let meta: any = {}
  try {
    meta = await request.json()
  }
  catch {
    console.error(`${ type } ${ name } could not be found`)
    Deno.exit(1)
  }
  const target: PackageMeta = meta[ `${ Deno.build.os }_${ Deno.build.arch }` ]
  if (!target) {
    console.error(`${ type } ${ name } does not support ${ `${ Deno.build.os }_${ Deno.build.arch }` }`)
    Deno.exit(1)
  }

  const { version, url } = await evaluatePackageMeta(target)
  const downloadRequest = await fetch(url)

  if (!downloadRequest.body) {
    throw new Error('')
  }

  const filename = url.substring(url.lastIndexOf('/') + 1)
  const file = await Deno.open(`./${ filename }`, { create: true, write: true, read: true })
  for await (const chunk of downloadRequest.body) {
    await Deno.writeAll(file, chunk)
  }
  file.close()

  const child = Deno.run({ cmd: [ 'tar', 'xf', `./${ filename }` ], stdout: 'piped', stderr: 'piped' })
  console.log(new TextDecoder().decode(await child.output()))
  console.error(new TextDecoder().decode(await child.stderrOutput()))

  if (target.type === 'source' && target.build) {
    for (const command of target.build) {
      const child = Deno.run({ cmd: command.split(' '), stdout: 'piped', stderr: 'piped', cwd: filename.split('.tar')[ 0 ] })
      console.log(new TextDecoder().decode(await child.output()))
      console.error(new TextDecoder().decode(await child.stderrOutput()))
    }
  }
}

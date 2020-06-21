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

if (action === 'install') {
  const [ type, name, version ] = args
  const request = await fetch(`${ MIRROR_LOCATION.endsWith('/') ? MIRROR_LOCATION.substring(0, MIRROR_LOCATION.length - 1) : MIRROR_LOCATION }/${ type }/${ name }.json`)
  const meta = await request.json()
  console.log(meta, Deno.build)
}

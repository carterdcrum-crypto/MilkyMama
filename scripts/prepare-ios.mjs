import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const run = (args) => execFileSync(npx, args, { stdio: 'inherit' })

if (!existsSync('ios/App/App.xcodeproj/project.pbxproj')) {
  run(['cap', 'add', 'ios'])
}
run(['cap', 'sync', 'ios'])

const plistPath = 'ios/App/App/Info.plist'
if (!existsSync(plistPath)) throw new Error(`Missing ${plistPath}`)

let plist = readFileSync(plistPath, 'utf8')
const usageKey = 'NSAlarmKitUsageDescription'
if (!plist.includes(`<key>${usageKey}</key>`)) {
  plist = plist.replace(
    '</dict>',
    `\t<key>${usageKey}</key>\n\t<string>Milky Mama uses alarms to remind you when it is time to pump.</string>\n</dict>`,
  )
  writeFileSync(plistPath, plist)
}

console.log('Milky Mama iOS project is ready.')

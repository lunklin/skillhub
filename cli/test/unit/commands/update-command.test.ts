import { describe, expect, test } from 'bun:test'
import { updateCommand } from '../../../src/commands/update'

describe('updateCommand', () => {
  test.each([{}, { check: true }, { check: true, json: true }])('rejects update and version comparisons (%j)', async options => {
    await expect(updateCommand(options)).rejects.toThrow('reviewed CHEERY Fork release process')
  })
})

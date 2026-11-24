import { describe, expect, test } from 'bun:test'
import { UpdateService } from '../../../src/services/update-service'

describe('UpdateService', () => {
  test.each([true, false])('blocks both update and version checks (%s)', async checkOnly => {
    const service = new UpdateService()
    await expect(service.update({ checkOnly })).rejects.toThrow('disabled')
  })
})

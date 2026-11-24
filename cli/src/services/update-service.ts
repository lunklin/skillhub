import { EXIT } from '../shared/constants'
import { CliError } from '../shared/errors'

export interface UpdateOptions {
  checkOnly: boolean
}

export class UpdateService {
  async update(options: UpdateOptions): Promise<never> {
    const action = options.checkOnly ? 'CLI version checks' : 'Automatic CLI updates'
    throw new CliError(`${action} are disabled; use the reviewed CHEERY Fork release process`, EXIT.usage)
  }
}

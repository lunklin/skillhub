import { UpdateService } from '../services/update-service'

export interface UpdateCommandOptions {
  check?: boolean
  json?: boolean
}

export async function updateCommand(options: UpdateCommandOptions): Promise<string> {
  return new UpdateService().update({ checkOnly: Boolean(options.check) })
}

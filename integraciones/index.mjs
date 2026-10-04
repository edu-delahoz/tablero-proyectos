// Registro de conectores por tipo. Trello y Azure DevOps se añaden con la misma interfaz que github-projects.mjs.
import * as githubProjects from './github-projects.mjs'

export const ADAPTADORES = { 'github-projects': githubProjects }
export const NOMBRES = { 'github-projects': 'GitHub Projects', trello: 'Trello', 'azure-devops': 'Azure DevOps' }

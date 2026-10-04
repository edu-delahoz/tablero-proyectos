// Registro de conectores por tipo; todos comparten la interfaz de github-projects.mjs.
import * as githubProjects from './github-projects.mjs'
import * as trello from './trello.mjs'
import * as azureDevops from './azure-devops.mjs'

export const ADAPTADORES = { 'github-projects': githubProjects, trello, 'azure-devops': azureDevops }
export const NOMBRES = { 'github-projects': 'GitHub Projects', trello: 'Trello', 'azure-devops': 'Azure DevOps' }

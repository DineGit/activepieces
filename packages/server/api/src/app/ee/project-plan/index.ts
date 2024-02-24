export type FlowPlanLimits = {
    nickname: string
    tasks: number
    minimumPollingInterval: number
    connections: number
    teamMembers: number
}

export const DEFAULT_FREE_PLAN_LIMIT = {
    nickname: 'free',
    tasks: 1000,
    teamMembers: 1,
    connections: 100,
    minimumPollingInterval: 5,
}

export const DEFAULT_PLATFOR_LIMIT = {
    nickname: 'platform',
    connections: 100,
    tasks: 50000,
    teamMembers: 5,
    minimumPollingInterval: 1,
}
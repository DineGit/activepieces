import { ProjectUsage } from '@activepieces/shared'
import dayjs from 'dayjs'
import { flowRunService } from '../../flows/flow-run/flow-run-service'
import { projectMemberService } from '../../ee/project-members/project-member.service'


export const projectUsageService = {
    async get30DaysUsage(projectId: string): Promise<ProjectUsage> {
        const created = dayjs().subtract(30, 'day').toDate()
        const flowTasks = await flowRunService.getTasksUsedAfter({
            projectId,
            created: created.toISOString(),
        })
        const teamMembers = await projectMemberService.countTeamMembersIncludingOwner(projectId)
        return {
            tasks: flowTasks,
            teamMembers,
        }
    },
}
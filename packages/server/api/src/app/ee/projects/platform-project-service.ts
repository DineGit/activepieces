import {
    Project,
    ProjectId,
    UserId,
    isNil,
    SeekPage,
    assertNotNullOrUndefined,
    spreadIfDefined,
    ProjectWithLimits,
} from '@activepieces/shared'
import { Equal, In, IsNull } from 'typeorm'
import {
    PlatformId,
    ProjectMemberStatus,
    UpdateProjectPlatformRequest,
} from '@activepieces/ee-shared'
import { ProjectMemberEntity } from '../project-members/project-member.entity'
import { ProjectEntity } from '../../project/project-entity'
import { databaseConnection } from '../../database/database-connection'
import { userService } from '../../user/user-service'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { projectLimitsService } from '../project-plan/project-plan.service'
import { projectUsageService } from '../../project/usage/project-usage-service'
import { DEFAULT_FREE_PLAN_LIMIT } from '../project-plan'

const projectRepo = databaseConnection.getRepository(ProjectEntity)
const projectMemberRepo = databaseConnection.getRepository(ProjectMemberEntity)

export const platformProjectService = {
    async getAll({
        ownerId,
        platformId,
        externalId,
    }: {
        ownerId: UserId | undefined
        platformId?: PlatformId
        externalId?: string
    }): Promise<SeekPage<ProjectWithLimits>> {
        const filters = await createFilters(ownerId, platformId, externalId)
        const projectPlans = await projectRepo
            .createQueryBuilder('project')
            .leftJoinAndMapOne(
                'project.plan',
                'project_plan',
                'project_plan',
                'project.id = "project_plan"."projectId"',
            )
            .where(filters)
            // TODO add pagination
            .limit(50)
            .getMany()
        const projects: ProjectWithLimits[] = await Promise.all(
            projectPlans.map(enrichWithUsageAndPlan),
        )
        return paginationHelper.createPage<ProjectWithLimits>(
            projects,
            null,
        )
    },

    async update({ projectId, request }: UpdateParams): Promise<ProjectWithLimits> {
        await projectRepo.update(projectId, {
            displayName: request.displayName,
            notifyStatus: request.notifyStatus,
        })
        // TODO check for permission for teamMembers and tasks
        if (!isNil(request.plan)) {
            await projectLimitsService.upsert({
                ...spreadIfDefined('teamMembers', request.plan.teamMembers),
                tasks: request.plan.tasks,
            }, projectId)
        }
        return this.getWithPlanAndUsageOrThrow(projectId)
    },
    async getWithPlanAndUsageOrThrow(
        projectId: string,
    ): Promise<ProjectWithLimits> {
        return enrichWithUsageAndPlan(
            await projectRepo.findOneByOrFail({
                id: projectId,
            }),
        )
    },
}

async function createFilters(
    ownerId: UserId | undefined,
    platformId?: PlatformId,
    externalId?: string | undefined,
) {
    const extraFilter = {
        ...spreadIfDefined('platformId', platformId),
        ...spreadIfDefined('externalId', externalId),
    }
    const filters = []

    if (!isNil(ownerId)) {
        const idsOfProjects = await getIdsOfProjects(ownerId)
        filters.push({ ownerId, ...extraFilter })
        filters.push({ id: In(idsOfProjects), ...extraFilter })
    }
    else {
        assertNotNullOrUndefined(platformId, 'platformId')
        filters.push({ ...extraFilter })
    }

    return filters
}

async function getIdsOfProjects(ownerId: UserId): Promise<string[]> {
    const user = await userService.getMetaInfo({ id: ownerId })
    const members = await projectMemberRepo.findBy({
        email: user?.email,
        platformId: isNil(user?.platformId) ? IsNull() : Equal(user?.platformId),
        status: Equal(ProjectMemberStatus.ACTIVE),
    })
    return members.map((member) => member.projectId)
}

async function enrichWithUsageAndPlan(
    project: Project,
): Promise<ProjectWithLimits> {
    return {
        ...project,
        plan: await projectLimitsService.getOrCreateDefaultPlan(project.id, DEFAULT_FREE_PLAN_LIMIT),
        usage: await projectUsageService.get30DaysUsage(project.id),
    }
}


type UpdateParams = {
    projectId: ProjectId
    request: UpdateProjectPlatformRequest
    platformId?: PlatformId
}
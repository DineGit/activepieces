import { randomBytes as randomBytesCallback } from 'node:crypto'
import { promisify } from 'node:util'
import {
    AuthenticationResponse,
    PlatformRole,
    PrincipalType,
    Project,
    ProjectId,
    ProjectType,
    User,
} from '@activepieces/shared'
import { userService } from '../../user/user-service'
import {
    DEFAULT_PLATFORM_PLAN,
    PlatformId,
    ProjectMemberRole,
    ProjectMemberStatus,
} from '@activepieces/ee-shared'
import { platformService } from '../platform/platform.service'
import { projectService } from '../../project/project-service'
import { projectMemberService } from '../project-members/project-member.service'
import { accessTokenManager } from '../../authentication/lib/access-token-manager'
import { externalTokenExtractor } from './lib/external-token-extractor'
import { plansService } from '../billing/project-plan/project-plan.service'

export const managedAuthnService = {
    async externalToken({
        externalAccessToken,
    }: AuthenticateParams): Promise<AuthenticationResponse> {
        const externalPrincipal = await externalTokenExtractor.extract(
            externalAccessToken,
        )
        const user = await getOrCreateUser(externalPrincipal)

        const token = await accessTokenManager.generateToken({
            id: user.id,
            type: PrincipalType.USER,
            projectId: user.projectId,
            projectType: ProjectType.PLATFORM_MANAGED,
            platform: {
                id: externalPrincipal.platformId,
                role: PlatformRole.MEMBER,
            },
        })

        return {
            ...user,
            token,
        }
    },
}

const getOrCreateUser = async (
    params: GetOrCreateUserParams,
): Promise<GetOrCreateUserReturn> => {
    const {
        platformId,
        externalUserId,
        externalProjectId,
        externalEmail,
        externalFirstName,
        externalLastName,
    } = params
    const existingUser = await userService.getByPlatformAndExternalId({
        platformId,
        externalId: externalUserId,
    })

    const project = await getOrCreateProject({
        platformId,
        externalProjectId,
    })

    await projectMemberService.upsert({
        projectId: project.id,
        email: params.externalEmail,
        role: ProjectMemberRole.EDITOR,
        status: ProjectMemberStatus.ACTIVE,
    })

    if (existingUser) {
        const { password: _, ...user } = existingUser

        return {
            ...user,
            projectId: project.id,
        }
    }

    const { password: _, ...newUser } = await userService.create({
        email: externalEmail,
        password: await generateRandomPassword(),
        firstName: externalFirstName,
        lastName: externalLastName,
        trackEvents: true,
        newsLetter: true,
        verified: true,
        externalId: externalUserId,
        platformId,
    })

    return {
        ...newUser,
        projectId: project.id,
    }
}

const getOrCreateProject = async ({
    platformId,
    externalProjectId,
}: GetOrCreateProjectParams): Promise<Project> => {
    const existingProject = await projectService.getByPlatformIdAndExternalId({
        platformId,
        externalId: externalProjectId,
    })

    if (existingProject) {
        return existingProject
    }

    const platform = await platformService.getOneOrThrow(platformId)

    const project = await projectService.create({
        displayName: externalProjectId,
        ownerId: platform.ownerId,
        platformId,
        type: ProjectType.PLATFORM_MANAGED,
        externalId: externalProjectId,
    })

    await plansService.update({
        projectId: project.id,
        subscription: null,
        planLimits: DEFAULT_PLATFORM_PLAN,
    })
    return project
}

const randomBytes = promisify(randomBytesCallback)

const generateRandomPassword = async (): Promise<string> => {
    const passwordBytes = await randomBytes(32)
    return passwordBytes.toString('hex')
}

type AuthenticateParams = {
    externalAccessToken: string
}

type GetOrCreateUserParams = {
    platformId: PlatformId
    externalUserId: string
    externalProjectId: string
    externalEmail: string
    externalFirstName: string
    externalLastName: string
}

type GetOrCreateUserReturn = Omit<User, 'password'> & {
    projectId: ProjectId
}

type GetOrCreateProjectParams = {
    platformId: PlatformId
    externalProjectId: string
}

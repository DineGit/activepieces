import Stripe from 'stripe'
import { SystemProp, system, exceptionHandler } from 'server-shared'
import {
    ApEdition,
    ProjectId,
    UserMeta,
    assertNotNullOrUndefined,
} from '@activepieces/shared'
import { getEdition } from '../../../helper/secret-helper'

export const stripeWebhookSecret = system.get(
    SystemProp.STRIPE_WEBHOOK_SECRET,
)!

function getStripe(): Stripe | undefined {
    const edition = getEdition()
    if (edition !== ApEdition.CLOUD) {
        return undefined
    }
    const stripeSecret = system.getOrThrow(SystemProp.STRIPE_SECRET_KEY)
    return new Stripe(stripeSecret, {
        apiVersion: '2023-10-16',
    })
}

async function getOrCreateCustomer(
    user: UserMeta,
    projectId: ProjectId,
): Promise<string | undefined> {
    const edition = getEdition()
    const stripe = getStripe()
    if (edition !== ApEdition.CLOUD) {
        return undefined
    }
    assertNotNullOrUndefined(stripe, 'Stripe is not configured')
    try {
        // Retrieve the customer by their email
        const existingCustomers = await stripe.customers.list({
            email: user.email,
            limit: 1,
        })

        // If a customer with the email exists, update their details
        if (existingCustomers.data.length > 0) {
            const existingCustomer = existingCustomers.data[0]
            return existingCustomer.id
        }

        // If no customer with the email exists, create a new customer
        const newCustomer = await stripe.customers.create({
            email: user.email,
            name: user.firstName + ' ' + user.lastName,
            description: 'User Id: ' + user.id + ' Project Id: ' + projectId,
        })
        return newCustomer.id
    }
    catch (error) {
        exceptionHandler.handle(error)
        throw error
    }
}

async function createPortalSessionUrl(customerId: string): Promise<string> {
    const stripe = getStripe()
    assertNotNullOrUndefined(stripe, 'Stripe is not configured')
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://cloud.activepieces.com/',
    })
    return session.url
}

export const stripeHelper = {
    createPortalSessionUrl,
    getStripe,
    getOrCreateCustomer,
}

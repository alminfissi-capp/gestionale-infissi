export type Plan = 'trial' | 'base' | 'pro' | 'business'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused'

export type Role = 'admin' | 'operator' | 'viewer'

export type OrgSubscription = {
  plan: Plan
  subscription_status: SubscriptionStatus
  trial_ends_at: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export type Invite = {
  id: string
  organization_id: string
  email: string
  role: Role
  token: string
  invited_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}

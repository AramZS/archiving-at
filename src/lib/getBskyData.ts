import { Agent, type OAuthSession } from '@atproto/api'
import type { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs'

/**
 * Fetches the authenticated user's profile data from the Bluesky PDS.
 * Creates an Agent from the session and retrieves profile details including
 * displayName, handle, avatar, and other account metadata.
 *
 * @param session - OAuth session obtained from the OAuth client
 * @returns The user's profile details or null if the fetch fails
 */
export async function getUserProfile(session: OAuthSession): Promise<ProfileViewDetailed | null> {
  try {
    const agent = new Agent(session)
    const response = await agent.getProfile({ actor: agent.accountDid })
    return response.data
  } catch (error) {
    console.error('[getBskyData] failed to fetch user profile:', error)
    return null
  }
}

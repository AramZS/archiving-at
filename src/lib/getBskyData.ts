import { Agent, type OAuthSession } from '@atproto/api'
import type { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs'

export type RepoRecord = {
  uri: string
  cid: string
  value: { [key: string]: unknown }
}

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

/**
 * Lists all test.record.activity records from the authenticated user's repo.
 *
 * @param session - OAuth session obtained from the OAuth client
 * @returns Repo records from the user's PDS, or an empty list if the fetch fails
 */
export async function getActivityRecords(session: OAuthSession): Promise<RepoRecord[]> {
  try {
    const agent = new Agent(session)
    const repo = agent.accountDid ?? session.sub
    const response = await agent.com.atproto.repo.listRecords({
      repo,
      collection: 'test.record.activity',
      limit: 100,
    })

    return response.data.records.map((record) => ({
      uri: record.uri,
      cid: record.cid,
      value: record.value,
    }))
  } catch (error) {
    console.error('[getBskyData] failed to fetch activity records:', error)
    return []
  }
}

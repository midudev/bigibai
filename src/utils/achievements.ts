import { supabaseAdmin } from '@/supabase-admin'
import { ACHIEVEMENTS, type Achievement } from '@/data/achievements'

export async function grantAchievement(userId: string, achievementId: string) {
  if (!Object.hasOwn(ACHIEVEMENTS, achievementId)) {
    console.error(`Achievement ${achievementId} does not exist`)
    return { success: false, error: 'Achievement not found' }
  }

  try {
    // 1. Grant atomically in Postgres: the upsert locks the user's row and merges the key,
    //    so two achievements granted at once can't overwrite each other
    const { data: isNew, error: grantError } = await supabaseAdmin.rpc('grant_achievement', {
      p_user_id: userId,
      p_achievement_id: achievementId,
    })

    if (grantError) {
      console.error('Error granting achievement:', grantError)
      return { success: false, error: grantError.message }
    }

    // 2. Check if already earned
    if (!isNew) {
      return { success: true, new: false } // Already earned
    }

    // 3. Return achievement data for notification
    const achievement = ACHIEVEMENTS[achievementId]
    return { 
      success: true, 
      new: true,
      achievement: {
        id: achievement.id,
        title: achievement.title,
        description: achievement.descriptionDone,
        image: achievement.image,
      }
    }
  } catch (error) {
    console.error('Unexpected error granting achievement:', error)
    return { success: false, error: 'Unexpected error' }
  }
}

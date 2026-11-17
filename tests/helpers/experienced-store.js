import { MemoryStore } from '../../server/store/memory.js';

// Existing browser scenarios exercise ordinary fights. New-account onboarding has its
// own browser scenario; these fixtures explicitly represent players who already did it.
export class ExperiencedStore extends MemoryStore {
  async createPlayer(player) {
    const row = await super.createPlayer(player);
    await this.completeTutorial(row.gamertag_lower);
    return { ...row, tutorial_done: true };
  }
}

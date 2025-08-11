import BaseRxDBModel from './BaseRxDBModel.js';

/**
 * Team Model
 * Handles team data using RxDB
 */
class Team extends BaseRxDBModel {
    constructor(teamData = {}) {
        super('teams', teamData);
        this.team_id = teamData.team_id;
        this.game_id = teamData.game_id;
        this.team_number = teamData.team_number;
        this.current_score = teamData.current_score || 0;
        this.player1_id = teamData.player1_id;
        this.player2_id = teamData.player2_id;
    }

    /**
     * Find teams by game ID
     * @param {string} gameId - Game ID
     * @returns {Promise<Array>} Array of teams
     */
    static async findByGameId(gameId) {
        try {
            const teamModel = new Team();
            const teams = await teamModel.find({ game_id: gameId });
            return teams.map(teamData => new Team(teamData));
        } catch (error) {
            console.error('[Team] FindByGameId error:', error.message);
            throw error;
        }
    }

    /**
     * Update team score
     * @param {number} score - New score
     * @returns {Promise<Team>} Updated team instance
     */
    async updateScore(score) {
        try {
            const updatedTeam = await this.updateById(this.team_id, {
                current_score: score
            });

            if (updatedTeam) {
                this.current_score = score;
                console.log(`[Team] Updated team ${this.team_id} score to ${score}`);
            }

            return this;
        } catch (error) {
            console.error('[Team] UpdateScore error:', error.message);
            throw error;
        }
    }
}

export default Team;
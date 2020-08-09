/**
 * GET /search -> search for new games from giantbomb api
 *   -> QUERY: q=encoded_text&limit=number&offset=number
 *   -> RESP: { games: GB_Game[], limit: number, offset: number, total: number }
 * GET /games -> get all games; pagination
 *   -> QUERY: limit=number&offset=number
 *   -> RESP: { games: Game[], limit: number, offset: number }
 * POST /games -> add a new game
 *   -> BODY: { id: string, name: string, gb_uuid: string } Game
 *   -> RESP: { id: string, name: string, gb_uuid: string } Game
 * GET /user/:userid/games -> get all games for user; pagination
 *   -> QUERY: limit=number&offset=number
 *   -> RESP: { games: Game[] }
 * POST /user/:userid/games/:gameid/relationship -> add a relationship between user and game
 *   -> BODY: { relationship: Relationship_enum }
 * PUT /user/:userid/games/:gameid/relationship -> change relationship between user and game
 *   -> BODY: { from: Relationship_enum, to: Relationship_enum }
 */

import express from 'express';
import { json } from 'body-parser';
import compression from 'compression';
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.GRAPHENEDB_BOLT_URL,
  neo4j.auth.basic(
    process.env.GRAPHENEDB_BOLT_USER,
    process.env.GRAPHENEDB_BOLT_PASSWORD,
  ),
  { encrypted: 'ENCRYPTION_ON' },
);

const app = express();
app.use(json());
app.use(compression());

app.get('/_ping', (_, res) => res.sendStatus(200));

type Game = {
  id: string;
  name: string;
  gb_uuid?: string;
};

type GameRelationship =
  | 'COMPLETE_100'
  | 'BEATEN'
  | 'SET_ASIDE_ENJOYED'
  | 'SET_ASIDE'
  | 'GOT_BORED'
  | 'WOULD_LIKE'
  | 'INTERESTED_IN';

type GameWithRelationship = {
  game: Game;
  relationship: GameRelationship;
};

// returns all games
app.get('/games', async (req, res) => {
  const session = driver.session();
  const limit = Number(req.query.limit || '25');
  const offset = Number(req.query.offset || '0');

  try {
    const result = await session.run(
      `MATCH (n:Game) RETURN n.id AS id, n.name AS name ORDER BY n.name SKIP $offset LIMIT $limit`,
      { limit, offset },
    );
    const games: Game[] = result.records.map((record) => {
      return {
        id: record.get('id'),
        name: record.get('name'),
      };
    });

    res.json({
      games,
      limit,
      offset,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

app.get('/users/:userid/games', async (req, res) => {
  const session = driver.session();
  const limit = Number(req.query.limit || '25');
  const offset = Number(req.query.offset || '0');
  const userId = req.params.userid;

  if (!userId) {
    return res.status(400).json({ message: 'userId path param required' });
  }

  try {
    const result = await session.run(
      `MATCH (u:User { id: $userId })-[r]->(g:Game) return count(g) as total, u.id as userId, u.name as userName, r, g as game ORDER BY g.name SKIP $offset LIMIT $limit`,
      { limit, offset, userId },
    );

    const totalResult = await session.run(
      `MATCH (u:User { id: $userId })-[r]->(g:Game) return count(g) as total`,
      { userId },
    );

    const total = totalResult.records[0].get('total').toString();

    const games: GameWithRelationship[] = result.records.map((record) => {
      const game = record.get('game');
      return {
        game: {
          id: game.properties.id,
          name: game.properties.name,
        },
        relationship: record.get('r').type,
      };
    });

    res.json({ games, limit, offset, total });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

app.listen(process.env.PORT, () => {
  console.log(` started server on http://localhost:${process.env.PORT}`);
});

/**
 * GET /search -> search for new games from giantbomb api
 *   -> QUERY: q=encoded_text&limit=number&offset=number
 *   -> RESP: { games: GB_Game[], limit: number, offset: number, total: number }
 * PUT /user/:userid/games/:gameid/relationship -> change relationship between user and game
 *   -> BODY: { from: Relationship_enum, to: Relationship_enum }
 */

import express from 'express';
import { json } from 'body-parser';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import neo4j from 'neo4j-driver';
import { gidFrom } from './gid';

type User = {
  id: string;
  name: string;
};

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
  | 'WOULD_NOT_LIKE';

type GameWithRelationship = {
  game: Game;
  relationship: GameRelationship;
};

const VALID_RELATIONSHIPS = new Set<GameRelationship>([
  'COMPLETE_100',
  'BEATEN',
  'SET_ASIDE_ENJOYED',
  'SET_ASIDE',
  'GOT_BORED',
  'WOULD_NOT_LIKE',
]);

const RELATIONSHIP_DISTANCES = new Map<GameRelationship, number>([
  ['COMPLETE_100', 1],
  ['BEATEN', 2],
  ['SET_ASIDE_ENJOYED', 3],
  ['SET_ASIDE', 5],
  ['GOT_BORED', 8],
  ['WOULD_NOT_LIKE', 13],
]);

const driver = neo4j.driver(
  process.env.GRAPHENEDB_BOLT_URL,
  neo4j.auth.basic(
    process.env.GRAPHENEDB_BOLT_USER,
    process.env.GRAPHENEDB_BOLT_PASSWORD,
  ),
  { encrypted: 'ENCRYPTION_ON' },
);

const app = express();
app.use(helmet());
app.use(morgan('combined'));
app.use(json());
app.use(compression());

app.get('/_ping', (_, res) => res.sendStatus(200));

// create a session
app.use((req, _, next) => {
  req.session = driver.session();
  next();
});

/**
 * GET /users -> get all users; pagination
 *   -> QUERY: limit=number&offset=number
 *   -> RESP: { users: User[], limit: number, offset: number, total: number }
 */
app.get('/users', async (req, res) => {
  const tx = req.session.beginTransaction();
  const limit = Number(req.query.limit || '25');
  const offset = Number(req.query.offset || '0');

  try {
    const [usersResponse, totalResult] = await Promise.all([
      tx.run(
        'MATCH (u:User) RETURN u.id AS id, u.name AS name ORDER BY u.name SKIP $offset LIMIT $limit',
        { limit, offset },
      ),
      tx.run('MATCH (u:User) RETURN count(u) AS total'),
    ]);

    const total = totalResult.records[0].get('total').toString();

    const users: User[] = usersResponse.records.map((record) => {
      return {
        id: record.get('id'),
        name: record.get('name'),
      };
    });

    res.json({ users, total, limit, offset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
    await tx.rollback();
  }
});

/**
 * GET /games -> get all games; pagination
 *   -> QUERY: limit=number&offset=number
 *   -> RESP: { games: Game[], limit: number, offset: number }
 */
app.get('/games', async (req, res) => {
  const session = req.session;
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

/**
 * GET /user/:userid/games -> get all games for user; pagination
 *   -> QUERY: limit=number&offset=number
 *   -> RESP: { games: Game[] }
 */
app.get('/users/:userid/games', async (req, res, next) => {
  const session = req.session;
  const limit = Number(req.query.limit || '25');
  const offset = Number(req.query.offset || '0');
  const userId = req.params.userid;

  if (!userId) {
    res.status(400).json({ message: 'userId path param required' });
    return next();
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

/**
 * POST /games -> add a new game
 *   -> BODY: { id: string, name: string, gb_uuid: string } Game
 *   -> RESP: { id: string, name: string, gb_uuid: string } Game
 */
app.post('/games', async (req, res, next) => {
  const session = req.session;
  const name = req.body.name;
  if (!name) {
    res.status(400).json({ message: 'Game name required' });
    next();
    return;
  }

  const id = gidFrom(req.body.name);

  try {
    await session.run(`CREATE (:Game { id: $id, name: $name })`, { id, name });
    res.json({ id, name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

/**
 * POST /users/:userid/games/:gameid/relationship -> add a relationship between user and game
 *   -> BODY: { relationship: Relationship_enum }
 */
app.post(
  '/users/:userid/games/:gameid/relationship',
  async (req, res, next) => {
    const userId = req.params.userid;
    const gameId = req.params.gameid;
    const relationship = req.body.relationship;

    if (!userId) {
      res.status(400).json({ message: 'Invalid userid' });
      return next();
    }

    if (!gameId) {
      res.status(400).json({ message: 'Invalid gameid' });
      return next();
    }

    if (!VALID_RELATIONSHIPS.has(relationship)) {
      res
        .status(400)
        .json({ message: `Invalid relationship: ${relationship}` });
      return next();
    }

    const dist = neo4j.int(RELATIONSHIP_DISTANCES.get(relationship));

    try {
      await req.session.run(
        `MATCH (u:User {id: $userId}), (g:Game {id: $gameId}) MERGE (u)-[:${relationship} {dist: $dist}]->(g)`,
        { userId, gameId, dist },
      );
      res.sendStatus(200);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  },
);

// ** ADD NEW ROUTES HERE ** //

// auto-cleanup sessions
app.use((req, _, next) => {
  if (req.session) {
    req.session.close();
  }

  next();
});

app.listen(process.env.PORT, () => {
  console.log(` started server on http://localhost:${process.env.PORT}`);
});

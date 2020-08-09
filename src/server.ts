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

const app = express();
app.use(json());
app.use(compression());

app.get('/_ping', (_, res) => res.sendStatus(200));
app.get('/hello', (_, res) => res.json({ response: 'world' }));

app.listen(process.env.PORT, () => {
  console.log(` started server on http://localhost:${process.env.PORT}`);
});

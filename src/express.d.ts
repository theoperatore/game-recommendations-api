import { Session } from 'neo4j-driver';

declare global {
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

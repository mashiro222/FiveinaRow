import { chooseMove } from './ai.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, ...chooseMove(data.board, data.color, data.options, data.level) }); }
  catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};

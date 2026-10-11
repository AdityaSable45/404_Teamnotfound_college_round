import { app } from './app.js';
import { logger } from './utils/logger.js';
const PORT = parseInt(process.env.PORT || '3001', 10);

app.listen(PORT, () => {
  logger.info(`Second Opinion server running on port ${PORT}`);
  logger.info(`Claim Extraction API ready at http://localhost:${PORT}/api/claims/extract`);
});

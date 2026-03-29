import { createApp } from '@/server/features/api/app';
import { registerAuthRoutes } from '@/server/features/api/routes/auth';
import { registerProfileRoutes } from '@/server/features/api/routes/profile';
import { registerChatRoutes } from '@/server/features/api/routes/chat';
import { registerKitRoutes } from '@/server/features/api/routes/kit';
import { registerEventRoutes } from '@/server/features/api/routes/events';
import { registerProductRoutes } from '@/server/features/api/routes/products';
import { registerTreatmentRoutes } from '@/server/features/api/routes/treatments';
import { registerStoreRoutes } from '@/server/features/api/routes/stores';
import { registerClinicRoutes } from '@/server/features/api/routes/clinics';

const app = createApp();

registerAuthRoutes(app);
registerProfileRoutes(app);
registerChatRoutes(app);
registerKitRoutes(app);
registerEventRoutes(app);
registerProductRoutes(app);
registerTreatmentRoutes(app);
registerStoreRoutes(app);
registerClinicRoutes(app);

export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
export const DELETE = app.fetch;
export const PATCH = app.fetch;

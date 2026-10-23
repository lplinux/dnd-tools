/**
 * api/surveys.js — the two routes a PLAYER touches.
 *
 * Account-wide rather than campaign-scoped: the bubble asks "is anything
 * waiting for me anywhere", and the server resolves which seat that is. The
 * DM's own survey routes live in api/campaigns.js, because those are scoped
 * to the campaign being managed.
 */
import { client } from './client';

export const surveysApi = {
  pending: ()            => client.get('/surveys/pending'),
  form:    (runId)       => client.get(`/surveys/runs/${runId}/form`),
  // The link page: by share token, never by id.
  byToken: (token)       => client.get(`/surveys/link/${encodeURIComponent(token)}`),
  submit:  (runId, data) => client.post(`/surveys/runs/${runId}/responses`, data),
};

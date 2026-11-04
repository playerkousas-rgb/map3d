/** Shared local/CI stage selection. Default MUST retain both complete suites. */
export function uiStagePlan(stage='all'){
  if(!['all','dev','production'].includes(stage))throw new Error('UI stage must be all, dev or production');
  return {dev:stage!=='production',production:stage!=='dev'};
}

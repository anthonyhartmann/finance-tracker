import { config as cfg } from '../adapter';
export const getProperty = cfg.getProperty.bind(cfg);
export const setProperty = cfg.setProperty.bind(cfg);
export const deleteProperty = cfg.deleteProperty.bind(cfg);
export const getKeys = cfg.getKeys.bind(cfg);
export { cfg as config };

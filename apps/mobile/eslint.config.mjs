import root from '../../eslint.config.mjs';

export default [...root, { ignores: ['.expo/**', 'android/**', 'ios/**'] }];

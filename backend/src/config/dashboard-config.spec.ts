import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadConfig, validateConfig } from './dashboard-config';

describe('configuración', () => {
  it('la configuración versionada es válida', () => {
    const cfg = loadConfig(join(__dirname, '../../dashboard.config.json'));
    expect(cfg.projects.map((p) => p.key)).toEqual(['SGCC', 'CSE']);
  });

  it('rechaza categorías desconocidas en el mapeo de estados', () => {
    expect(() =>
      validateConfig({
        projects: [{ key: 'A', label: 'A', boardId: 1 }],
        statusMap: { '1': 'HECHO' },
        fields: { sprint: 'x', startDate: 'y' },
      }),
    ).toThrow(ConfigError);
  });

  it('rechaza feriados con formato incorrecto', () => {
    expect(() =>
      validateConfig({
        projects: [{ key: 'A', label: 'A', boardId: 1 }],
        statusMap: {},
        fields: { sprint: 'x', startDate: 'y' },
        duration: { mode: 'businessDays', holidays: ['25/12/2026'] },
      }),
    ).toThrow(/AAAA-MM-DD/);
  });
});

describe('contrato backend/frontend', () => {
  it('las dos copias de contract son idénticas', () => {
    const back = readFileSync(join(__dirname, '../contract/snapshot.ts'), 'utf8');
    const front = readFileSync(join(__dirname, '../../../frontend/src/domain/contract.ts'), 'utf8');
    expect(front).toBe(back);
  });
});

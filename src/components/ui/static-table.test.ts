import { describe, expect, it } from 'vitest';
import { StaticTable } from './static-table';

describe('StaticTable', () => {
  it('renders semantic headers and rows from declarative columns', () => {
    const el = StaticTable({
      columns: [
        { key: 'name', label: 'Name', render: (row: { name: string }) => row.name },
        {
          key: 'count',
          label: 'Count',
          align: 'right',
          headerClassName: 'w-20',
          className: 'tabular-nums',
          render: (row: { count: number }) => row.count,
        },
      ],
      rows: [{ name: 'Jobs', count: 3 }],
      getRowKey: (row) => row.name,
      ariaLabel: 'Operations',
    });
    expect(el.type).toBe('table');
    expect(el.props['aria-label']).toBe('Operations');
    const [thead, tbody] = el.props.children;
    expect(thead.props.children.props.children[0].props.scope).toBe('col');
    expect(thead.props.children.props.children[0].props.className).toContain('text-left');
    expect(thead.props.children.props.children[1].props.className).toContain('w-20');
    expect(tbody.props.children[0].props.children[1].props.className).toContain('text-right');
    expect(tbody.props.children[0].props.children[1].props.className).toContain('tabular-nums');
  });
});

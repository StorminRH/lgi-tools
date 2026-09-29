import { describe, expect, it } from 'vitest';
import { StaticTable } from './static-table';

describe('StaticTable', () => {
  it('renders semantic headers and rows from declarative columns', () => {
    const el = StaticTable({
      columns: [
        {
          key: 'name',
          label: 'Name',
          rowHeader: true,
          render: (row: { name: string }) => row.name,
        },
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
      theadClassName: 'sticky top-0',
    });
    expect(el.type).toBe('table');
    expect(el.props['aria-label']).toBe('Operations');
    const [thead, tbody] = el.props.children;
    expect(thead.props.className).toContain('sticky');
    expect(thead.props.children.props.children[0].props.scope).toBe('col');
    expect(thead.props.children.props.children[0].props.className).toContain('text-left');
    expect(thead.props.children.props.children[1].props.className).toContain('w-20');
    expect(tbody.props.children[0].props.children[0].type).toBe('th');
    expect(tbody.props.children[0].props.children[0].props.scope).toBe('row');
    expect(tbody.props.children[0].props.children[0].props.className).toContain('font-normal');
    expect(tbody.props.children[0].props.children[1].props.className).toContain('text-right');
    expect(tbody.props.children[0].props.children[1].props.className).toContain('tabular-nums');
  });

  it('adds a click target and a full-width detail row under an expanded row', () => {
    const onClick = () => undefined;
    const el = StaticTable({
      columns: [
        { key: 'a', label: 'A', render: (row: { id: number }) => row.id },
        { key: 'b', label: 'B', render: (row: { id: number }) => row.id * 2 },
      ],
      rows: [{ id: 1 }, { id: 2 }],
      getRowKey: (row) => row.id,
      ariaLabel: 'Rows',
      rowProps: (row) => ({ onClick, expanded: row.id === 1, className: 'hover:bg-row-hover' }),
      renderDetail: (row) => (row.id === 1 ? 'detail' : null),
    });
    const [, tbody] = el.props.children;
    const rows = tbody.props.children;
    expect(rows).toHaveLength(3);
    expect(rows[0].props.onClick).toBe(onClick);
    expect(rows[0].props['aria-expanded']).toBe(true);
    expect(rows[0].props.className).toContain('cursor-pointer');
    expect(rows[1].key).toBe('1:detail');
    expect(rows[1].props.children.props.colSpan).toBe(2);
    expect(rows[2].props['aria-expanded']).toBe(false);
  });
});

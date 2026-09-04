'use client';

import { Button, Card, Input, cn } from '@nexora/ui';
import {
  FILTER_FIELDS,
  OPERATORS_BY_FIELD,
  TASK_PRIORITIES,
  isFilterGroup,
  type FilterCondition,
  type FilterField,
  type FilterGroup,
  type FilterOperator,
} from '@nexora/shared';
import { Plus, X } from 'lucide-react';
import type { ViewColumn } from './shared';

/**
 * The AND/OR filter builder.
 *
 * A tree rather than a list, because "urgent OR overdue, and not done" is the
 * shape people actually want and cannot be said as a list of clauses. The
 * component is recursive for the same reason the data is.
 *
 * Nesting is capped at three levels here (the schema allows four) so the UI
 * cannot build something the API would reject - a validation error arriving
 * after the fact would be the builder's fault, not the user's.
 */

const MAX_DEPTH = 3;

const FIELD_LABEL: Record<FilterField, string> = {
  title: 'Title',
  statusId: 'Column',
  priority: 'Priority',
  assigneeId: 'Assignee',
  labelId: 'Label',
  dueDate: 'Due date',
  startDate: 'Start date',
  completed: 'Completed',
};

const OPERATOR_LABEL: Record<FilterOperator, string> = {
  is: 'is',
  'is-not': 'is not',
  contains: 'contains',
  'not-contains': 'does not contain',
  before: 'is before',
  after: 'is after',
  on: 'is on',
  'is-empty': 'is empty',
  'is-not-empty': 'is not empty',
};

const NEEDS_NO_VALUE = new Set<FilterOperator>(['is-empty', 'is-not-empty']);

const selectClass =
  'border-border bg-surface text-fg focus-visible:outline-ring h-8 rounded-sm border px-2 text-[13px] focus-visible:outline-2';

export interface BuilderContext {
  columns: ViewColumn[];
  people: { id: string; name: string }[];
}

function ValueInput({
  condition,
  context,
  onChange,
}: {
  condition: FilterCondition;
  context: BuilderContext;
  onChange: (value: string) => void;
}) {
  if (NEEDS_NO_VALUE.has(condition.operator)) return null;

  const label = `Value for ${FIELD_LABEL[condition.field]}`;
  const value = condition.value ?? '';

  if (condition.field === 'priority') {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        <option value="">Choose…</option>
        {TASK_PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority}
          </option>
        ))}
      </select>
    );
  }

  if (condition.field === 'statusId') {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        <option value="">Choose…</option>
        {context.columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.name}
          </option>
        ))}
      </select>
    );
  }

  if (condition.field === 'assigneeId') {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        <option value="">Choose…</option>
        {context.people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    );
  }

  if (condition.field === 'completed') {
    return (
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={selectClass}
      >
        <option value="true">yes</option>
        <option value="false">no</option>
      </select>
    );
  }

  if (condition.field === 'dueDate' || condition.field === 'startDate') {
    return (
      <Input
        type="date"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-40"
      />
    );
  }

  return (
    <Input
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Text…"
      className="h-8 w-40"
    />
  );
}

function ConditionRow({
  condition,
  context,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  context: BuilderContext;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
}) {
  const operators = OPERATORS_BY_FIELD[condition.field];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Field"
        value={condition.field}
        onChange={(event) => {
          const field = event.target.value as FilterField;
          // Keep the operator only if it still makes sense for the new field.
          const allowed = OPERATORS_BY_FIELD[field];
          const operator = allowed.includes(condition.operator)
            ? condition.operator
            : (allowed[0] ?? 'is');
          onChange({ field, operator, value: null });
        }}
        className={selectClass}
      >
        {FILTER_FIELDS.map((field) => (
          <option key={field} value={field}>
            {FIELD_LABEL[field]}
          </option>
        ))}
      </select>

      <select
        aria-label="Condition"
        value={condition.operator}
        onChange={(event) =>
          onChange({ ...condition, operator: event.target.value as FilterOperator })
        }
        className={selectClass}
      >
        {operators.map((operator) => (
          <option key={operator} value={operator}>
            {OPERATOR_LABEL[operator]}
          </option>
        ))}
      </select>

      <ValueInput
        condition={condition}
        context={context}
        onChange={(value) => onChange({ ...condition, value })}
      />

      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label={`Remove the ${FIELD_LABEL[condition.field]} condition`}
        onClick={onRemove}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function GroupEditor({
  group,
  context,
  depth,
  path,
  onChange,
  onRemove,
}: {
  group: FilterGroup;
  context: BuilderContext;
  depth: number;
  path: number[];
  onChange: (next: FilterGroup) => void;
  onRemove?: (() => void) | undefined;
}) {
  function update(index: number, node: FilterCondition | FilterGroup | null) {
    const conditions = [...group.conditions];
    if (node === null) conditions.splice(index, 1);
    else conditions[index] = node;
    onChange({ ...group, conditions });
  }

  return (
    <Card className={cn(depth > 0 && 'border-border-strong')}>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <fieldset className="flex items-center gap-1">
            <legend className="sr-only">Combine these conditions with</legend>
            {(['and', 'or'] as const).map((combinator) => (
              <label
                key={combinator}
                className={cn(
                  'focus-within:outline-ring cursor-pointer rounded-sm px-2 py-0.5 text-[12px] font-medium uppercase focus-within:outline-2',
                  group.combinator === combinator
                    ? 'bg-accent-soft text-accent'
                    : 'text-fg-muted hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`combinator-${path.join('-') || 'root'}`}
                  checked={group.combinator === combinator}
                  onChange={() => onChange({ ...group, combinator })}
                />
                {combinator}
              </label>
            ))}
          </fieldset>

          <span className="text-fg-subtle text-[12px]">
            {group.combinator === 'and' ? 'all of these' : 'any of these'}
          </span>

          {onRemove ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              aria-label="Remove this group"
              onClick={onRemove}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>

        {group.conditions.length === 0 ? (
          <p className="text-fg-subtle text-[12px]">Nothing yet — every task matches.</p>
        ) : null}

        <ul className="space-y-2">
          {group.conditions.map((node, index) => (
            <li key={index}>
              {isFilterGroup(node) ? (
                <GroupEditor
                  group={node}
                  context={context}
                  depth={depth + 1}
                  path={[...path, index]}
                  onChange={(next) => update(index, next)}
                  onRemove={() => update(index, null)}
                />
              ) : (
                <ConditionRow
                  condition={node}
                  context={context}
                  onChange={(next) => update(index, next)}
                  onRemove={() => update(index, null)}
                />
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                ...group,
                conditions: [
                  ...group.conditions,
                  { field: 'priority', operator: 'is', value: 'urgent' },
                ],
              })
            }
          >
            <Plus aria-hidden="true" />
            Condition
          </Button>

          {depth < MAX_DEPTH - 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange({
                  ...group,
                  conditions: [
                    ...group.conditions,
                    { combinator: group.combinator === 'and' ? 'or' : 'and', conditions: [] },
                  ],
                })
              }
            >
              <Plus aria-hidden="true" />
              Group
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function FilterBuilder({
  filter,
  context,
  onChange,
}: {
  filter: FilterGroup;
  context: BuilderContext;
  onChange: (next: FilterGroup) => void;
}) {
  return <GroupEditor group={filter} context={context} depth={0} path={[]} onChange={onChange} />;
}

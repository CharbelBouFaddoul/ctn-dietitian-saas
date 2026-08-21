"use client";

import { Button } from "@nutrition-saas/ui";

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  label = "items",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <p className="ui-row" style={{ marginTop: 16 }}>
      <span className="ui-muted">
        Page {page} of {totalPages} ({total} {label})
      </span>
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next
      </Button>
    </p>
  );
}

import { useState } from 'react';
import type { ChangeEvent } from 'react';

export function usePagination(defaultRowsPerPage = 10) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);

  function paginate<T>(rows: T[]): T[] {
    return rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }

  const handleChangePage = (_: unknown, newPage: number) => setPage(newPage);

  const handleChangeRowsPerPage = (e: ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  return { page, rowsPerPage, paginate, handleChangePage, handleChangeRowsPerPage, resetPage: () => setPage(0) };
}

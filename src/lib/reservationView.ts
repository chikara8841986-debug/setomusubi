type ReservationMonthLike = {
  reservation_date: string
}

type ReservationSortLike = ReservationMonthLike & {
  start_time: string
  created_at?: string
}

export function filterReservationsByMonth<T extends ReservationMonthLike>(reservations: T[], month: string): T[] {
  if (!month) return reservations
  return reservations.filter(reservation => reservation.reservation_date.startsWith(month))
}

export function sortReservationsNewestFirst<T extends ReservationSortLike>(reservations: T[]): T[] {
  return [...reservations].sort((a, b) => {
    const byReservationDate = `${b.reservation_date}T${b.start_time}`.localeCompare(`${a.reservation_date}T${a.start_time}`)
    if (byReservationDate !== 0) return byReservationDate
    return (b.created_at ?? '').localeCompare(a.created_at ?? '')
  })
}

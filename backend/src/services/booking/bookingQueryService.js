const bookingRepository = require('../../repositories/bookingRepository');
const { serializeBookings } = require('../../presenters/bookingPresenter');
const { BookingNotFoundError } = require('./bookingErrors');

const getBookingById = async (bookingId) => {
  const booking = await bookingRepository.findByIdWithRelations(bookingId);
  if (!booking) throw new BookingNotFoundError();
  const [serialized] = await serializeBookings([booking]);
  return serialized;
};

module.exports = { getBookingById };

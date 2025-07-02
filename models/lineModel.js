import mongoose from 'mongoose';

const stopSchema = new mongoose.Schema({
    name: { type: String, required: true },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number], // [lng, lat]
            required: true
        }
    }
});

const lineSchema = new mongoose.Schema({
  lineNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  schedule: [String],
  itinerary: String,
  stops: [stopSchema],
  routePath: {
    type: {
      type: String,
      enum: ['LineString'],
      required: true
    },
    coordinates: {
      type: [[Number]], // [lng, lat]
      required: true
    }
  }
}, { timestamps: true });

lineSchema.index({ 'routePath': '2dsphere' });
lineSchema.index({ 'stops.location': '2dsphere' });

const Line = mongoose.model('Line', lineSchema);
export default Line;
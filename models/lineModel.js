import mongoose from 'mongoose';

const stopSchema = new mongoose.Schema({
    name: { 
      type: String, 
      required: [true, 'Stop Name is required'], 
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            required: [true, 'Stop type is required'],
        },
        coordinates: {
            type: [Number], // [lng, lat]
            required: [true, 'Stop coords is required'],
        }
    },
	stopProgress: {
		type: Number
	},
	distanceFromStart: {
		type: Number
	}
});

const lineSchema = new mongoose.Schema({
	lineNumber: { 
		type: String, 
		required: [true, 'Line number is required'], 
		unique: [true, 'Line number already exists']
	},
	name: { 
		type: String, 
		required: [true, 'Line name is required'], 
	},
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

export const Line = mongoose.model('Line', lineSchema);
import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema({
	driver: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'User',
		required: [true, 'Driver Id is required'],
	},
	line: {
		type: mongoose.Schema.Types.ObjectId,
		ref: 'Line',
		required: [true, 'Line Id is required'],
	},
	startTime: {
		type: Date,
		default: Date.now,
	},
	isActive: {
		type: Boolean,
		default: true,
	},
	currentPosition: {
		type: {
			type: String,
			enum: ['Point'],
			default: 'Point',
		},
		coordinates: {
			type: [Number], // [lng, lat]
			default: undefined,
		},
		updatedAt: {
			type: Date,
			default: Date.now,
		},
	},
	lastPosition: {
		type: {
			type: String,
			enum: ['Point'],
		},
		coordinates: {
			type: [Number],
		},
		updatedAt: {
			type: Date,
		},
  	},
	distanceTraveled: {
		type: Number,
		default: 0
	},
	stopsReached: [
		{
			stopName: String,
			reachedAt: Date
		}
	],
	stopETAs: [
		{
			stopName: String,
			etaMinutes: Number,
		},
	],
	},{ timestamps: true }
);

tripSchema.index({ 'currentPosition': '2dsphere' });

export const Trip = mongoose.model('Trip', tripSchema);



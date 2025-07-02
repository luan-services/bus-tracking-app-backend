import mongoose from 'mongoose';

const etaHistorySchema = new mongoose.Schema(
  {
    line: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Line',
      required: true,
    },
    from: { type: String, required: true }, // nome da parada
    to: { type: String, required: true },   // nome da parada seguinte
    averageDuration: { type: Number, required: true }, // em minutos
    sampleCount: { type: Number, default: 1 } // total de amostras usadas
  },
  { timestamps: true }
);

etaHistorySchema.index({ line: 1, from: 1, to: 1 }, { unique: true });

const ETAHistory = mongoose.model('ETAHistory', etaHistorySchema);
export default ETAHistory;
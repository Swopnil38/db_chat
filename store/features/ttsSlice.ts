import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  ttsText: '',
  isPlaying: false,
};

const ttsSlice = createSlice({
  name: 'tts',
  initialState,
  reducers: {
    playTTS(state, action) {
      state.ttsText = action.payload;
      state.isPlaying = true;
    },
    stopTTS(state) {
      state.isPlaying = false;
    },
  },
});

export const { playTTS, stopTTS } = ttsSlice.actions;
export default ttsSlice.reducer;
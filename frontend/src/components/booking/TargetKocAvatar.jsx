import React from 'react';
import AppAvatar from '../AppAvatar';

const TargetKocAvatar = ({ src, name }) => (
  <AppAvatar src={src} name={name || 'KOC'} />
);

export default TargetKocAvatar;

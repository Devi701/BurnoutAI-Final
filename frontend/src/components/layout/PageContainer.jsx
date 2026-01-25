import React from 'react';
import PropTypes from 'prop-types';

export default function PageContainer({ children }) {
  return <div className="container">{children}</div>;
}

PageContainer.propTypes = {
  children: PropTypes.node
};
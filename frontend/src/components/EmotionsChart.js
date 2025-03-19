import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Box, Typography } from '@mui/material';
import { COMMON_EMOTIONS } from '../constants';

const EmotionsChart = ({ parts, height = 200 }) => {
  const svgRef = useRef(null);
  
  useEffect(() => {
    if (!parts || parts.length === 0 || !svgRef.current) return;
    
    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();
    
    // Count emotions across all parts
    const emotionCount = {};
    
    // Initialize with common emotions to ensure they're always present
    COMMON_EMOTIONS.forEach(emotion => {
      emotionCount[emotion.label.toLowerCase()] = {
        count: 0,
        color: emotion.color
      };
    });
    
    // Count emotions from all parts
    parts.forEach(part => {
      if (part.feelings && Array.isArray(part.feelings)) {
        part.feelings.forEach(feeling => {
          const feelingLower = feeling.toLowerCase();
          if (emotionCount[feelingLower]) {
            emotionCount[feelingLower].count++;
          } else {
            // For emotions not in the COMMON_EMOTIONS list
            emotionCount[feelingLower] = {
              count: 1,
              color: '#999999' // Default gray for unknown emotions
            };
          }
        });
      }
    });
    
    // Convert to array for D3
    const data = Object.entries(emotionCount)
      .map(([emotion, data]) => ({
        emotion,
        count: data.count,
        color: data.color
      }))
      .filter(item => item.count > 0)  // Only show emotions that appear
      .sort((a, b) => b.count - a.count);  // Sort by count descending
    
    // Set up dimensions
    const width = svgRef.current.clientWidth || 300;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Create the SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Create scales
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.emotion))
      .range([0, chartWidth])
      .padding(0.3);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.count) * 1.1])  // Add 10% padding
      .range([chartHeight, 0]);
    
    // Add axes
    g.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .style('font-size', '10px');
    
    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .style('font-size', '10px');
    
    // Add bars
    g.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.emotion))
      .attr('y', d => yScale(d.count))
      .attr('width', xScale.bandwidth())
      .attr('height', d => chartHeight - yScale(d.count))
      .attr('fill', d => d.color)
      .attr('rx', 4)  // Rounded corners
      .attr('ry', 4)
      .style('opacity', 0.8)
      .on('mouseover', function() {
        d3.select(this)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        d3.select(this)
          .style('opacity', 0.8);
      });
    
    // Add value labels on top of bars
    g.selectAll('.label')
      .data(data)
      .enter().append('text')
      .attr('class', 'label')
      .attr('x', d => xScale(d.emotion) + xScale.bandwidth() / 2)
      .attr('y', d => yScale(d.count) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#333')
      .text(d => d.count);
    
    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', '#555')
      .text('Emotions Across Parts');
      
  }, [parts, height]);
  
  if (!parts || parts.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No emotions data available
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box sx={{ width: '100%', height }}>
      <svg ref={svgRef} width="100%" height={height} />
    </Box>
  );
};

export default EmotionsChart; 
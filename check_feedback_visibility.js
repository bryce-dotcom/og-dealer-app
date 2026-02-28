// Run this in the browser console
const feedbackBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.innerText?.includes('Feedback'));
if (feedbackBtn) {
  const styles = window.getComputedStyle(feedbackBtn);
  console.log('=== FeedbackButton Computed Styles ===');
  console.log('display:', styles.display);
  console.log('visibility:', styles.visibility);
  console.log('opacity:', styles.opacity);
  console.log('zIndex:', styles.zIndex);
  console.log('position:', styles.position);
  console.log('bottom:', styles.bottom);
  console.log('left:', styles.left);
  console.log('width:', styles.width);
  console.log('height:', styles.height);
  console.log('backgroundColor:', styles.backgroundColor);
  console.log('color:', styles.color);
  console.log('border:', styles.border);
  console.log('transform:', styles.transform);
  console.log('clip:', styles.clip);
  console.log('clipPath:', styles.clipPath);
  console.log('Bounding rect:', feedbackBtn.getBoundingClientRect());
  console.log('=== End ===');
} else {
  console.log('FeedbackButton not found');
}

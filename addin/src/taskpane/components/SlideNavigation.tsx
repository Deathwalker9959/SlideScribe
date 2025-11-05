import React from 'react';
import { Card } from '@ui/card';
import { Button } from '@ui/button';
import { Badge } from '@ui/badge';
import { ScrollArea } from '@ui/scroll-area';
import { Plus, Trash2, Copy, FileText } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  content: string;
}

interface SlideNavigationProps {
  slides: Slide[];
  currentSlideId: string;
  onSlideSelect: (slideId: string) => void;
  onSlideAdd: () => void;
  onSlideDelete: (slideId: string) => void;
  onSlideDuplicate: (slideId: string) => void;
}

export function SlideNavigation({
  slides,
  currentSlideId,
  onSlideSelect,
  onSlideAdd,
  onSlideDelete,
  onSlideDuplicate
}: SlideNavigationProps) {
  
  const getSlidePreview = (slide: Slide) => {
    const title = slide.title || 'Untitled Slide';
    const contentPreview = slide.content 
      ? slide.content.substring(0, 50) + (slide.content.length > 50 ? '...' : '')
      : 'No content';
    
    return { title, contentPreview };
  };

  return (
    <Card className="p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Slides
        </h3>
        <Badge variant="secondary" className="text-xs">
          {slides.length} slide{slides.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      <ScrollArea className="flex-1 mb-4">
        <div className="space-y-2">
          {slides.map((slide, index) => {
            const { title, contentPreview } = getSlidePreview(slide);
            const isActive = slide.id === currentSlideId;
            
            return (
              <div
                key={slide.id}
                className={`p-3 rounded-lg border cursor-pointer transition-all group ${
                  isActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                }`}
                onClick={() => onSlideSelect(slide.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-muted-foreground font-medium">
                        Slide {index + 1}
                      </span>
                    </div>
                    <h4 className="font-medium text-sm truncate mb-1">
                      {title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {contentPreview}
                    </p>
                  </div>
                  
                  <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSlideDuplicate(slide.id);
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    {slides.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlideDelete(slide.id);
                        }}
                        className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <Button
        onClick={onSlideAdd}
        className="w-full flex items-center gap-2"
        variant="outline"
      >
        <Plus className="w-4 h-4" />
        Add Slide
      </Button>
    </Card>
  );
}
import { Module, type DynamicModule } from '@nestjs/common';
import {
  TextbooksController,
  TEXTBOOKS,
  EXPORTS,
  REVIEW,
} from './presentation/textbooks.controller.js';
import type { TextbooksService } from './application/textbooks.service.js';
import type { ExportService } from './application/export.service.js';
import type { ReviewService } from '../review/application/review.service.js';
@Module({})
export class TextbooksModule {
  static register(
    books: TextbooksService,
    exports: ExportService,
    review: ReviewService,
  ): DynamicModule {
    return {
      module: TextbooksModule,
      controllers: [TextbooksController],
      providers: [
        { provide: TEXTBOOKS, useValue: books },
        { provide: EXPORTS, useValue: exports },
        { provide: REVIEW, useValue: review },
      ],
    };
  }
}

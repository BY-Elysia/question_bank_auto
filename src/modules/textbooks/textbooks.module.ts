import type { ExportPreparation } from './application/export-preparation.js';
import { Module, type DynamicModule } from '@nestjs/common';
import {
  TextbooksController,
  TEXTBOOKS,
  EXPORTS,
  REVIEW,
  EXPORT_PREPARATION,
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
    preparation: ExportPreparation,
  ): DynamicModule {
    return {
      module: TextbooksModule,
      controllers: [TextbooksController],
      providers: [
        { provide: EXPORT_PREPARATION, useValue: preparation },
        { provide: TEXTBOOKS, useValue: books },
        { provide: EXPORTS, useValue: exports },
        { provide: REVIEW, useValue: review },
      ],
    };
  }
}
